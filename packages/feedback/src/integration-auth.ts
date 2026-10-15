import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export function integrationSecret(
  master: string,
  installationId: string,
  direction: "portal" | "service",
  version: number,
) {
  if (master.length < 32)
    throw new Error(
      "Integration signing secret must have at least 32 characters.",
    );
  return createHmac("sha256", master)
    .update(
      JSON.stringify([
        "feedbax-integration-v1",
        installationId,
        direction,
        version,
      ]),
    )
    .digest("base64url");
}

export function signIntegrationRequest(input: {
  url: string;
  installationId: string;
  secret: string;
  body?: string;
  method?: string;
  now?: number;
  nonce?: string;
}) {
  const method = input.method ?? "POST";
  const time = String(Math.floor((input.now ?? Date.now()) / 1000));
  const nonce = input.nonce ?? randomUUID();
  const body = input.body ?? "";
  const signature = mac(
    input.secret,
    method,
    input.url,
    input.installationId,
    time,
    nonce,
    body,
  );
  return new Request(input.url, {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      "X-Feedbax-Installation": input.installationId,
      "X-Feedbax-Time": time,
      "X-Feedbax-Nonce": nonce,
      "X-Feedbax-Signature": signature,
    },
    ...(method === "GET" ? {} : { body }),
  });
}

export function verifyIntegrationRequest(
  request: Request,
  body: string,
  secret: string,
  now = Date.now(),
) {
  const installationId = request.headers.get("X-Feedbax-Installation") ?? "";
  const time = request.headers.get("X-Feedbax-Time") ?? "";
  const nonce = request.headers.get("X-Feedbax-Nonce") ?? "";
  const signature = request.headers.get("X-Feedbax-Signature") ?? "";
  if (
    secret.length < 32 ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(installationId) ||
    !/^\d{10}$/.test(time) ||
    Math.abs(now - Number(time) * 1000) > 300_000 ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)
  )
    return false;
  return equalSignature(
    signature,
    mac(secret, request.method, request.url, installationId, time, nonce, body),
  );
}

export function equalSignature(actual: string, expected: string) {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function mac(
  secret: string,
  method: string,
  url: string,
  installation: string,
  time: string,
  nonce: string,
  body: string,
) {
  return createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "feedbax-integration-v1",
        method,
        url,
        installation,
        time,
        nonce,
        body,
      ]),
    )
    .digest("hex");
}

export async function boundedBody(request: Request, maximum: number) {
  if (Number(request.headers.get("Content-Length")) > maximum)
    throw new Error("Request body limit exceeded.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error("Request body limit exceeded.");
      }
      chunks.push(value);
    }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
