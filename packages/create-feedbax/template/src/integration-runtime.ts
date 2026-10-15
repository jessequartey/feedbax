import { createHmac, randomUUID } from "node:crypto";
import type { FeedbaxConfig } from "@feedbax/config";
import {
  boundedBody,
  signIntegrationRequest,
  verifyIntegrationRequest,
  type ConnectedDatabase,
  type FeedbackModule,
} from "@feedbax/feedback";

interface Credential {
  portal_secret: string;
  delivery_secret: string;
  revoked: number;
}
export function createPortalIntegration(options: {
  config: FeedbaxConfig;
  database: ConnectedDatabase;
  pairingSecret?: string;
  now?: () => number;
}) {
  const { config, database } = options;
  const now = options.now ?? Date.now;
  const github = config.provider === "github" ? config.github : undefined;
  const credential = () =>
    github
      ? database
          .prepare(
            "SELECT * FROM integration_credentials WHERE installation_id=?",
          )
          .bind(github.installationId)
          .first<Credential>()
      : Promise.resolve(null);
  const json = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  return {
    async portalSecret() {
      const row = await credential();
      if (!row || row.revoked)
        throw new Error(
          "GitHub Portal Binding is missing or revoked. Pair the Installation again.",
        );
      return row.portal_secret;
    },
    async handle(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/internal/integration/")) return;
      if (
        !github ||
        !config.product.siteUrl ||
        url.origin !== new URL(config.product.siteUrl).origin
      )
        return json({ error: "Not found." }, 404);
      if (request.method !== "POST")
        return json({ error: "Method not allowed." }, 405);
      try {
        const body = await boundedBody(request, 4096);
        const pairing = url.pathname === "/internal/integration/pair";
        const stored = pairing ? null : await credential();
        const secret = pairing
          ? options.pairingSecret
          : stored?.delivery_secret;
        if (
          !secret ||
          request.headers.get("X-Feedbax-Installation") !==
            github.installationId ||
          !verifyIntegrationRequest(request, body, secret)
        )
          return json({ error: "Unauthorized." }, 401);
        const input = JSON.parse(body) as Record<string, unknown>;
        if (!input || typeof input !== "object" || Array.isArray(input))
          return json({ error: "Invalid delivery." }, 400);
        const nonce = database
          .prepare(
            "INSERT INTO portal_integration_nonces(installation_id,nonce,expires_at) VALUES(?,?,?)",
          )
          .bind(
            github.installationId,
            request.headers.get("X-Feedbax-Nonce"),
            now() + 600_000,
          );
        if (pairing) {
          const keys = input.credentials as
            { portalSecret?: unknown; deliverySecret?: unknown } | undefined;
          if (
            typeof input.challenge !== "string" ||
            !/^[A-Za-z0-9_-]{43}$/.test(input.challenge) ||
            input.repositoryId !== github.repository.id ||
            input.botUserId !== github.botUserId ||
            !keys ||
            typeof keys.portalSecret !== "string" ||
            typeof keys.deliverySecret !== "string" ||
            !/^[A-Za-z0-9_-]{43}$/.test(keys.portalSecret) ||
            !/^[A-Za-z0-9_-]{43}$/.test(keys.deliverySecret) ||
            keys.portalSecret === keys.deliverySecret
          )
            return json(
              { error: "Pairing does not match this Installation." },
              400,
            );
          await database.batch([
            nonce,
            database
              .prepare(
                "INSERT INTO integration_credentials(installation_id,portal_secret,delivery_secret,paired_at) VALUES(?,?,?,?) ON CONFLICT(installation_id) DO UPDATE SET portal_secret=excluded.portal_secret,delivery_secret=excluded.delivery_secret,paired_at=excluded.paired_at,revoked=0",
              )
              .bind(
                github.installationId,
                keys.portalSecret,
                keys.deliverySecret,
                now(),
              ),
          ]);
          const proof = createHmac("sha256", secret)
            .update(
              JSON.stringify([
                "feedbax-pair-v1",
                github.installationId,
                url.origin,
                github.serviceUrl,
                input.challenge,
              ]),
            )
            .digest("hex");
          return json({ proof });
        }
        if (url.pathname !== "/internal/integration/delivery")
          return json({ error: "Not found." }, 404);
        if (
          typeof input.eventId !== "string" ||
          !/^[A-Za-z0-9:_-]{1,200}$/.test(input.eventId) ||
          !["reconcile", "revoke"].includes(String(input.kind))
        )
          return json({ error: "Invalid delivery." }, 400);
        if (stored?.revoked && input.kind !== "revoke")
          return json({ error: "Unauthorized." }, 401);
        await database.batch([
          nonce,
          database
            .prepare(
              "INSERT OR IGNORE INTO integration_receipts(installation_id,event_id,kind,received_at) VALUES(?,?,?,?)",
            )
            .bind(github.installationId, input.eventId, input.kind, now()),
          ...(input.kind === "revoke"
            ? [
                database
                  .prepare(
                    "UPDATE integration_credentials SET revoked=1 WHERE installation_id=?",
                  )
                  .bind(github.installationId),
              ]
            : []),
        ]);
        return json({ accepted: true }, 202);
      } catch {
        return json(
          {
            error:
              "Delivery was not accepted. Retry with a fresh authenticated request.",
          },
          401,
        );
      }
    },
    async reconcile(feedback: FeedbackModule, limit = 1) {
      if (!github) return;
      if (!Number.isInteger(limit) || limit < 1 || limit > 10)
        throw new Error("Reconciliation work limit must be 1–10.");
      const time = now();
      const candidate = await database
        .prepare(
          "SELECT event_id FROM integration_receipts WHERE installation_id=? AND state='pending' AND next_attempt<=? AND lease_until<=? ORDER BY COALESCE(last_checked_at,0),received_at,event_id LIMIT 1",
        )
        .bind(github.installationId, time, time)
        .first<{ event_id: string }>();
      if (!candidate) return;
      const lease = randomUUID();
      const work = await database
        .prepare(
          "UPDATE integration_receipts SET lease_token=?,lease_until=?,attempts=attempts+1,last_checked_at=? WHERE installation_id=? AND event_id=? AND state='pending' AND next_attempt<=? AND lease_until<=? RETURNING event_id,cursor,attempts",
        )
        .bind(
          lease,
          time + 60_000,
          time,
          github.installationId,
          candidate.event_id,
          time,
          time,
        )
        .first<{ event_id: string; cursor: string; attempts: number }>();
      if (!work) return;
      const record = await credential();
      if (!record || record.revoked) {
        await database
          .prepare(
            "UPDATE integration_receipts SET state='complete',last_checked_at=?,lease_until=0 WHERE installation_id=? AND event_id=? AND lease_token=?",
          )
          .bind(now(), github.installationId, work.event_id, lease)
          .run();
        return;
      }
      try {
        const posts = (
          await database
            .prepare(
              "SELECT post_id,slug FROM github_posts WHERE installation_id=? AND repository_id=? AND state='ready' AND post_id>? ORDER BY post_id LIMIT ?",
            )
            .bind(
              github.installationId,
              github.repository.id,
              work.cursor,
              limit,
            )
            .all<{ post_id: string; slug: string }>()
        ).results;
        for (const post of posts) await feedback.getPublicPost(post.slug);
        await database
          .prepare(
            "UPDATE integration_receipts SET cursor=?,state=?,last_checked_at=?,failure_code=NULL,attempts=0,lease_until=0 WHERE installation_id=? AND event_id=? AND cursor=? AND lease_token=?",
          )
          .bind(
            posts.at(-1)?.post_id ?? work.cursor,
            posts.length < limit ? "complete" : "pending",
            now(),
            github.installationId,
            work.event_id,
            work.cursor,
            lease,
          )
          .run();
      } catch {
        const delay =
          Math.min(3600_000, 60_000 * 2 ** Math.min(work.attempts - 1, 6)) +
          Math.floor(Math.random() * 10_000);
        await database
          .prepare(
            "UPDATE integration_receipts SET state=?,failure_code='provider_unavailable',next_attempt=?,lease_until=0 WHERE installation_id=? AND event_id=? AND lease_token=?",
          )
          .bind(
            work.attempts >= 5 ? "failed" : "pending",
            time + delay,
            github.installationId,
            work.event_id,
            lease,
          )
          .run();
      }
      await database.batch([
        database
          .prepare("DELETE FROM portal_integration_nonces WHERE expires_at<?")
          .bind(now()),
        database
          .prepare(
            "UPDATE integration_receipts SET failure_code=NULL WHERE received_at<?",
          )
          .bind(now() - 30 * 86400_000),
      ]);
    },
    signedRequest(path: "/v1/status" | "/v1/revoke", secret: string) {
      if (!github) throw new Error("GitHub is not configured.");
      return signIntegrationRequest({
        url: `${github.serviceUrl}${path}`,
        installationId: github.installationId,
        secret,
        body: "{}",
      });
    },
  };
}
