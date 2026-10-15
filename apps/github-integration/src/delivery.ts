import type { D1Database } from "@cloudflare/workers-types";
import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  boundedBody,
  equalSignature,
  signIntegrationRequest,
} from "../../../packages/feedback/src/integration-auth";

import { bindingSecret } from "./binding-secret";

interface Binding {
  installation_id: string;
  origin: string;
  github_installation_id: number;
  repository_id: number;
  key_version: number;
  active: number;
}
interface Work {
  id: string;
  installation_id: string;
  kind: string;
  attempts: number;
  lease_token: string;
  binding_version: number;
}
export function createDeliveryModule(options: {
  database: D1Database;
  appId: string;
  webhookSecret: string;
  signingSecret: string;
  deliver(origin: string, request: Request): Promise<Response>;
  now?: () => number;
}) {
  const { database } = options;
  const now = options.now ?? Date.now;
  const response = (status: number) =>
    Response.json(
      { accepted: status === 202 },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  return {
    async ingest(request: Request) {
      let raw: string;
      try {
        raw = await boundedBody(request, 256 * 1024);
      } catch {
        return response(413);
      }
      const signature = request.headers.get("X-Hub-Signature-256") ?? "";
      const expected = `sha256=${createHmac("sha256", options.webhookSecret).update(raw).digest("hex")}`;
      if (!options.webhookSecret || !equalSignature(signature, expected))
        return response(401);
      const delivery = request.headers.get("X-GitHub-Delivery") ?? "";
      const event = request.headers.get("X-GitHub-Event") ?? "";
      if (
        !/^[A-Za-z0-9-]{1,128}$/.test(delivery) ||
        !/^[a-z0-9_]{1,64}$/.test(event)
      )
        return response(400);
      let payload: {
        installation?: { id?: number };
        repository?: { id?: number };
        action?: string;
        repositories_removed?: { id: number }[];
      };
      try {
        payload = JSON.parse(raw);
      } catch {
        return response(400);
      }
      if (!payload || typeof payload !== "object") return response(400);
      const bindings = payload.installation?.id
        ? (
            await database
              .prepare(
                "SELECT * FROM portal_bindings WHERE github_installation_id=?",
              )
              .bind(payload.installation.id)
              .all<Binding>()
          ).results
        : [];
      const relevant = bindings.filter(
        (binding) =>
          event === "installation" ||
          (event === "installation_repositories" &&
            payload.repositories_removed?.some(
              (item) => item.id === binding.repository_id,
            )) ||
          payload.repository?.id === binding.repository_id,
      );
      const receipt = randomUUID();
      const time = now();
      const statements = [
        database
          .prepare(
            "INSERT OR IGNORE INTO webhook_receipts(app_id,delivery_id,ingress_token,event,received_at,payload) VALUES(?,?,?,?,?,?)",
          )
          .bind(options.appId, delivery, receipt, event, time, null),
      ];
      const ownsReceipt =
        "EXISTS(SELECT 1 FROM webhook_receipts WHERE app_id=? AND delivery_id=? AND ingress_token=?)";
      for (const binding of relevant) {
        const revoked =
          (event === "installation" &&
            ["deleted", "suspend"].includes(payload.action ?? "")) ||
          (event === "installation_repositories" &&
            payload.repositories_removed?.some(
              (item) => item.id === binding.repository_id,
            ));
        if (revoked)
          statements.push(
            database
              .prepare(
                `UPDATE portal_bindings SET active=0 WHERE installation_id=? AND key_version=? AND ${ownsReceipt}`,
              )
              .bind(
                binding.installation_id,
                binding.key_version,
                options.appId,
                delivery,
                receipt,
              ),
          );
        const id = createHash("sha256")
          .update(
            JSON.stringify([options.appId, delivery, binding.installation_id]),
          )
          .digest("hex");
        statements.push(
          database
            .prepare(
              `INSERT OR IGNORE INTO portal_work(id,app_id,delivery_id,installation_id,kind,priority,next_attempt,created_at,binding_version) SELECT ?,?,?,?,?,?,?,?,? WHERE ${ownsReceipt} AND EXISTS(SELECT 1 FROM portal_bindings WHERE installation_id=? AND key_version=?)`,
            )
            .bind(
              id,
              options.appId,
              delivery,
              binding.installation_id,
              revoked ? "revoke" : "reconcile",
              revoked ? 3 : 2,
              time,
              time,
              binding.key_version,
              options.appId,
              delivery,
              receipt,
              binding.installation_id,
              binding.key_version,
            ),
        );
      }
      try {
        await database.batch(statements);
      } catch {
        return response(503);
      }
      return response(202);
    },
    async process(limit = 1) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 10)
        throw new Error("Delivery work limit must be 1–10.");
      const time = now();
      // A missed webhook never prevents a later authoritative portal read. Queue
      // oldest destinations first and retain failed-event deduplication tombstones.
      const stale = (
        await database
          .prepare(
            "SELECT * FROM portal_bindings WHERE active=1 AND last_polled_at<? ORDER BY last_polled_at,installation_id LIMIT ?",
          )
          .bind(time - 300_000, limit)
          .all<Binding>()
      ).results;
      for (const binding of stale)
        await database.batch([
          database
            .prepare(
              "INSERT OR IGNORE INTO portal_work(id,app_id,installation_id,kind,next_attempt,created_at,binding_version) VALUES(?,?,?,'reconcile',?,?,?)",
            )
            .bind(
              `poll:${binding.installation_id}:${Math.floor(time / 300_000)}`,
              options.appId,
              binding.installation_id,
              time,
              time,
              binding.key_version,
            ),
          database
            .prepare(
              "UPDATE portal_bindings SET last_polled_at=? WHERE installation_id=?",
            )
            .bind(time, binding.installation_id),
        ]);
      const due = (
        await database
          .prepare(
            "SELECT id FROM portal_work WHERE state='pending' AND next_attempt<=? AND lease_until<=? ORDER BY priority DESC,next_attempt,id LIMIT ?",
          )
          .bind(time, time, limit)
          .all<{ id: string }>()
      ).results;
      let completed = 0;
      let failed = 0;
      for (const candidate of due) {
        const lease = randomUUID();
        const work = await database
          .prepare(
            "UPDATE portal_work SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=? AND state='pending' AND lease_until<=? RETURNING *",
          )
          .bind(lease, time + 60_000, candidate.id, time)
          .first<Work>();
        if (!work) continue;
        const binding = await database
          .prepare("SELECT * FROM portal_bindings WHERE installation_id=?")
          .bind(work.installation_id)
          .first<Binding>();
        try {
          if (!binding) throw new Error("Binding missing.");
          if (work.binding_version !== binding.key_version) {
            await database
              .prepare(
                "UPDATE portal_work SET state='complete',completed_at=?,failure_code=NULL,lease_until=0 WHERE id=? AND lease_token=?",
              )
              .bind(time, work.id, lease)
              .run();
            completed++;
            continue;
          }
          const kind = binding.active ? work.kind : "revoke";
          const result = await options.deliver(
            binding.origin,
            signIntegrationRequest({
              url: `${binding.origin}/internal/integration/delivery`,
              installationId: binding.installation_id,
              secret: bindingSecret(options.signingSecret, binding, "service"),
              body: JSON.stringify({ eventId: work.id, kind }),
            }),
          );
          await result.body?.cancel();
          if (!result.ok) throw new Error("Portal delivery failed.");
          await database.batch([
            database
              .prepare(
                "UPDATE portal_work SET state='complete',completed_at=?,failure_code=NULL,lease_until=0 WHERE id=? AND lease_token=?",
              )
              .bind(time, work.id, lease),
            database
              .prepare(
                "UPDATE portal_bindings SET last_delivery_at=? WHERE installation_id=? AND EXISTS(SELECT 1 FROM portal_work WHERE id=? AND lease_token=? AND state='complete')",
              )
              .bind(time, binding.installation_id, work.id, lease),
          ]);
          completed++;
        } catch {
          const delay =
            Math.min(3600_000, 60_000 * 2 ** Math.min(work.attempts - 1, 6)) +
            Math.floor(Math.random() * 10_000);
          await database
            .prepare(
              "UPDATE portal_work SET state=?,failure_code='portal_unavailable',next_attempt=?,lease_until=0 WHERE id=? AND lease_token=?",
            )
            .bind(
              work.attempts >= 5 ? "failed" : "pending",
              time + delay,
              work.id,
              lease,
            )
            .run();
          failed++;
        }
      }
      await database.batch([
        database
          .prepare(
            "UPDATE webhook_receipts SET payload=NULL WHERE received_at<? OR NOT EXISTS(SELECT 1 FROM portal_work WHERE portal_work.app_id=webhook_receipts.app_id AND portal_work.delivery_id=webhook_receipts.delivery_id AND state!='complete')",
          )
          .bind(time - 7 * 86400_000),
        database
          .prepare(
            "UPDATE portal_work SET failure_code=NULL WHERE created_at<?",
          )
          .bind(time - 30 * 86400_000),
        database
          .prepare("DELETE FROM integration_nonces WHERE expires_at<?")
          .bind(time),
        database
          .prepare("DELETE FROM pairing_attempts WHERE expires_at<?")
          .bind(time),
      ]);
      return { completed, failed };
    },
    async status(installationId: string) {
      const binding = await database
        .prepare(
          "SELECT active,last_delivery_at FROM portal_bindings WHERE installation_id=?",
        )
        .bind(installationId)
        .first<{ active: number; last_delivery_at: number }>();
      const pending = await database
        .prepare(
          "SELECT count(*) count,min(created_at) oldest FROM portal_work WHERE installation_id=? AND state='pending'",
        )
        .bind(installationId)
        .first<{ count: number; oldest: number | null }>();
      const terminal = await database
        .prepare(
          "SELECT count(*) count FROM portal_work WHERE installation_id=? AND state='failed' AND failure_code IS NOT NULL",
        )
        .bind(installationId)
        .first<{ count: number }>();
      return {
        active: Boolean(binding?.active),
        lastDeliveryAt: binding?.last_delivery_at || null,
        pending: pending?.count ?? 0,
        oldestPendingAt: pending?.oldest ?? null,
        terminalFailures: terminal?.count ?? 0,
      };
    },
  };
}
