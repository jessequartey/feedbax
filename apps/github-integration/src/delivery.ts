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
  cooldown_until: number;
}
interface Work {
  id: string;
  installation_id: string;
  kind: string;
  attempts: number;
  lease_token: string;
  binding_version: number;
  state: string;
  next_attempt: number;
  lease_until: number;
}
const recoveryInterval = 3600_000;
const outageCooldown = 24 * recoveryInterval;
export interface DeliveryResult {
  completed: number;
  failed: number;
  retryAfter?: number;
}

export function createDeliveryModule(options: {
  database: D1Database;
  appId: string;
  webhookSecret: string;
  signingSecret: string;
  deliver(origin: string, request: Request): Promise<Response>;
  now?: () => number;
  dispatch?: (workId: string, delaySeconds: number) => Promise<void>;
}) {
  const { database } = options;
  const now = options.now ?? Date.now;
  const response = (status: number) =>
    Response.json(
      { accepted: status === 202 },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  const retry = (until: number): DeliveryResult => ({
    completed: 0,
    failed: 0,
    retryAfter: Math.max(1, Math.min(86400, Math.ceil((until - now()) / 1000))),
  });
  async function dispatch(workId: string) {
    if (!options.dispatch) return;
    const time = now();
    const work = await database
      .prepare(
        "SELECT next_attempt,lease_until,dispatch_after FROM portal_work WHERE id=? AND state='pending'",
      )
      .bind(workId)
      .first<{
        next_attempt: number;
        lease_until: number;
        dispatch_after: number;
      }>();
    if (!work || work.dispatch_after > time) return;
    const delay = Math.max(
      0,
      Math.min(
        86400,
        Math.ceil(
          (Math.max(work.next_attempt, work.lease_until) - time) / 1000,
        ),
      ),
    );
    await options.dispatch(workId, delay);
    await database
      .prepare(
        "UPDATE portal_work SET dispatch_after=MAX(next_attempt,lease_until,?) WHERE id=? AND state='pending'",
      )
      .bind(time + recoveryInterval, workId)
      .run();
  }
  async function processWork(workId: string): Promise<DeliveryResult> {
    const idle = { completed: 0, failed: 0 };
    const time = now();
    const candidate = await database
      .prepare("SELECT * FROM portal_work WHERE id=?")
      .bind(workId)
      .first<Work>();
    if (!candidate || candidate.state !== "pending") return idle;
    if (candidate.lease_until > time || candidate.next_attempt > time)
      return retry(Math.max(candidate.lease_until, candidate.next_attempt));
    if (candidate.attempts >= 5) {
      await database
        .prepare(
          "UPDATE portal_work SET state='failed',failure_code='portal_unavailable' WHERE id=? AND state='pending' AND lease_until<=? AND attempts>=5",
        )
        .bind(workId, time)
        .run();
      return idle;
    }
    const binding = await database
      .prepare("SELECT * FROM portal_bindings WHERE installation_id=?")
      .bind(candidate.installation_id)
      .first<Binding>();
    if (
      binding?.active &&
      candidate.kind !== "revoke" &&
      candidate.binding_version === binding.key_version &&
      binding.cooldown_until > time
    ) {
      await database
        .prepare(
          "UPDATE portal_work SET next_attempt=MAX(next_attempt,?),dispatch_after=MAX(dispatch_after,?) WHERE id=? AND state='pending' AND binding_version=?",
        )
        .bind(
          binding.cooldown_until,
          binding.cooldown_until,
          workId,
          candidate.binding_version,
        )
        .run();
      return retry(binding.cooldown_until);
    }
    const lease = randomUUID();
    const work = await database
      .prepare(
        "UPDATE portal_work SET lease_token=?,lease_until=?,dispatch_after=?,attempts=attempts+1 WHERE id=? AND state='pending' AND lease_until<=? AND next_attempt<=? AND attempts<5 RETURNING *",
      )
      .bind(lease, time + 60_000, time + 60_000, workId, time, time)
      .first<Work>();
    if (!work) return retry(time + 60_000);
    try {
      if (!binding) throw new Error("Binding missing.");
      if (work.binding_version !== binding.key_version) {
        await database
          .prepare(
            "UPDATE portal_work SET state='complete',completed_at=?,failure_code=NULL,lease_until=0 WHERE id=? AND lease_token=?",
          )
          .bind(time, work.id, lease)
          .run();
        return { completed: 1, failed: 0 };
      }
      const signed = signIntegrationRequest({
        url: `${binding.origin}/internal/integration/delivery`,
        installationId: binding.installation_id,
        secret: bindingSecret(options.signingSecret, binding, "service"),
        body: JSON.stringify({
          eventId: work.id,
          kind: binding.active ? work.kind : "revoke",
        }),
      });
      const result = await options.deliver(
        binding.origin,
        new Request(signed, { signal: AbortSignal.timeout(10_000) }),
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
            "UPDATE portal_bindings SET last_delivery_at=?,cooldown_until=0,next_recovery_at=MAX(next_recovery_at,?) WHERE installation_id=? AND key_version=? AND EXISTS(SELECT 1 FROM portal_work WHERE id=? AND lease_token=? AND state='complete')",
          )
          .bind(
            time,
            time + recoveryInterval,
            binding.installation_id,
            binding.key_version,
            work.id,
            lease,
          ),
      ]);
      return { completed: 1, failed: 0 };
    } catch {
      const terminal = work.attempts >= 5;
      const next =
        time +
        Math.min(
          recoveryInterval,
          60_000 * 2 ** Math.min(work.attempts - 1, 6),
        ) +
        Math.floor(Math.random() * 10_000);
      const updates = [
        database
          .prepare(
            "UPDATE portal_work SET state=?,failure_code='portal_unavailable',next_attempt=?,dispatch_after=?,lease_until=0 WHERE id=? AND lease_token=? AND state='pending'",
          )
          .bind(terminal ? "failed" : "pending", next, next, work.id, lease),
      ];
      if (terminal && binding)
        updates.push(
          database
            .prepare(
              "UPDATE portal_bindings SET cooldown_until=?,next_recovery_at=MAX(next_recovery_at,?) WHERE installation_id=? AND key_version=? AND EXISTS(SELECT 1 FROM portal_work WHERE id=? AND lease_token=? AND state='failed')",
            )
            .bind(
              time + outageCooldown,
              time + outageCooldown,
              binding.installation_id,
              binding.key_version,
              work.id,
              lease,
            ),
        );
      await database.batch(updates);
      return {
        completed: 0,
        failed: 1,
        ...(terminal ? {} : { retryAfter: Math.ceil((next - time) / 1000) }),
      };
    }
  }
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
      if (
        ![
          "issues",
          "issue_comment",
          "installation",
          "installation_repositories",
        ].includes(event)
      )
        return response(202);
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
      const workIds: string[] = [];
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
        workIds.push(id);
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
        for (const id of workIds) await dispatch(id);
      } catch {
        return response(503);
      }
      return response(202);
    },
    processWork,
    dispatch,
    async processRevocation() {
      const time = now();
      const work = await database
        .prepare(
          "SELECT id FROM portal_work WHERE state='pending' AND priority=3 AND next_attempt<=? AND lease_until<=? ORDER BY next_attempt,id LIMIT 1",
        )
        .bind(time, time)
        .first<{ id: string }>();
      if (work) await processWork(work.id);
    },
    async process(limit = 1) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 10)
        throw new Error("Delivery work limit must be 1–10.");
      const time = now();
      const due = (
        await database
          .prepare(
            "SELECT id FROM portal_work WHERE state='pending' AND next_attempt<=? AND lease_until<=? ORDER BY priority DESC,next_attempt,id LIMIT ?",
          )
          .bind(time, time, limit)
          .all<{ id: string }>()
      ).results;
      const total = { completed: 0, failed: 0 };
      for (const work of due) {
        const result = await processWork(work.id);
        total.completed += result.completed;
        total.failed += result.failed;
      }
      return total;
    },
    async maintain() {
      const time = now();
      // Hourly, bounded recovery is separate from event delivery. An existing
      // reconciliation for this generation already represents current-state work.
      const stale = (
        await database
          .prepare(
            "SELECT * FROM portal_bindings WHERE active=1 AND next_recovery_at<=? ORDER BY next_recovery_at,installation_id LIMIT 10",
          )
          .bind(time)
          .all<Binding>()
      ).results;
      for (const binding of stale) {
        await database.batch([
          database
            .prepare(
              "INSERT OR IGNORE INTO portal_work(id,app_id,installation_id,kind,next_attempt,created_at,binding_version) SELECT ?,?,?,'reconcile',?,?,? WHERE EXISTS(SELECT 1 FROM portal_bindings WHERE installation_id=? AND key_version=? AND active=1 AND cooldown_until<=?) AND NOT EXISTS(SELECT 1 FROM portal_work WHERE installation_id=? AND binding_version=? AND state='pending' AND kind='reconcile')",
            )
            .bind(
              `poll:${binding.installation_id}:${binding.key_version}:${Math.floor(time / recoveryInterval)}`,
              options.appId,
              binding.installation_id,
              time,
              time,
              binding.key_version,
              binding.installation_id,
              binding.key_version,
              time,
              binding.installation_id,
              binding.key_version,
            ),
          database
            .prepare(
              "UPDATE portal_bindings SET last_polled_at=?,next_recovery_at=MAX(?,cooldown_until) WHERE installation_id=? AND key_version=?",
            )
            .bind(
              time,
              time + recoveryInterval,
              binding.installation_id,
              binding.key_version,
            ),
        ]);
      }
      // Also repairs the D1-commit/Queue-send crash window, expired leases and
      // signals that exhausted Queue retries. The oldest undispatched work wins.
      const pending = (
        await database
          .prepare(
            "SELECT id FROM portal_work WHERE state='pending' AND dispatch_after<=? ORDER BY dispatch_after,id LIMIT 100",
          )
          .bind(time)
          .all<{ id: string }>()
      ).results;
      let dispatchFailed = false;
      for (const work of pending) {
        try {
          await dispatch(work.id);
        } catch {
          dispatchFailed = true;
        }
      }
      await database.batch([
        database
          .prepare(
            "UPDATE webhook_receipts SET payload=NULL WHERE rowid IN (SELECT rowid FROM webhook_receipts WHERE payload IS NOT NULL AND (received_at<? OR NOT EXISTS(SELECT 1 FROM portal_work WHERE portal_work.app_id=webhook_receipts.app_id AND portal_work.delivery_id=webhook_receipts.delivery_id AND state!='complete')) ORDER BY received_at LIMIT 100)",
          )
          .bind(time - 7 * 86400_000),
        database
          .prepare(
            "UPDATE portal_work SET failure_code=NULL WHERE id IN (SELECT id FROM portal_work WHERE failure_code IS NOT NULL AND created_at<? ORDER BY created_at,id LIMIT 100)",
          )
          .bind(time - 30 * 86400_000),
        database
          .prepare(
            "DELETE FROM integration_nonces WHERE rowid IN (SELECT rowid FROM integration_nonces WHERE expires_at<? ORDER BY expires_at LIMIT 100)",
          )
          .bind(time),
        database
          .prepare(
            "DELETE FROM pairing_attempts WHERE state IN (SELECT state FROM pairing_attempts WHERE expires_at<? ORDER BY expires_at LIMIT 100)",
          )
          .bind(time),
      ]);
      if (dispatchFailed)
        throw new Error("Some delivery signals could not be queued.");
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
        recoveryIntervalMs: recoveryInterval,
        active: Boolean(binding?.active),
        lastDeliveryAt: binding?.last_delivery_at || null,
        pending: pending?.count ?? 0,
        oldestPendingAt: pending?.oldest ?? null,
        terminalFailures: terminal?.count ?? 0,
      };
    },
  };
}
