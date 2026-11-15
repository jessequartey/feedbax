import { env } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import { boundedBody } from "./request.ts";
import { readSettings } from "./settings.ts";

/** Authenticate the exact bytes before parsing; only enqueue, never call GitHub here. */
export async function handleGitHubWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !config.integrations.github) return new Response(null, { status: 404 });
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return new Response(null, { status: 401 });
  const body = await (await boundedBody(request, 256 * 1024)).arrayBuffer();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, (hex) =>
    Number.parseInt(hex, 16),
  );
  if (!(await crypto.subtle.verify("HMAC", key, bytes, body)))
    return new Response(null, { status: 401 });
  if (request.headers.get("x-github-event") !== "release")
    return new Response(null, { status: 204 });
  let payload: { action?: string; repository?: { full_name?: string }; release?: { id?: number } };
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    ![
      "published",
      "edited",
      "deleted",
      "unpublished",
      "prereleased",
      "released",
      "created",
    ].includes(payload.action ?? "")
  )
    return new Response(null, { status: 204 });
  const repo = config.integrations.github.repo.toLowerCase();
  const id = payload.release?.id;
  if (
    typeof payload.repository?.full_name !== "string" ||
    payload.repository.full_name.toLowerCase() !== repo ||
    !Number.isSafeInteger(id) ||
    id! <= 0
  )
    return new Response(null, { status: 400 });
  if ((await readSettings()).changelog.source !== "github")
    return new Response(null, { status: 204 });
  await env.SYNC_QUEUE.send({ type: "github.release", repo, releaseId: id! });
  return new Response(null, { status: 202 });
}
