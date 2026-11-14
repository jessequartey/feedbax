// Regenerates tests/fixtures/host-tokens.json deterministically (test-only secret).
// Run: node scripts/gen-host-token-vectors.ts
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";

const secretBytes = Buffer.alloc(32);
for (let i = 0; i < 32; i++) secretBytes[i] = (i * 7 + 3) & 0xff;
const SECRET = secretBytes.toString("base64url");
const NOW = 1_790_000_000;
const HEADER = '{"alg":"HS256","typ":"JWT"}';
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (signingInput: string, alg: "sha256" | "sha512" = "sha256", key = secretBytes) =>
  createHmac(alg, key).update(signingInput).digest("base64url");

type Claims = Record<string, unknown>;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const claims = (over: Claims = {}, n = 1): Claims => ({
  sub: "host-user-1",
  name: "Ada Lovelace",
  exp: NOW + 300,
  jti: uuid(n),
  ...over,
});
function token(c: Claims, header = HEADER, mutate?: (parts: string[]) => string[]): string {
  const h = b64(header);
  const p = b64(JSON.stringify(c));
  const parts = [h, p, sign(`${h}.${p}`)];
  return (mutate ? mutate(parts) : parts).join(".");
}

type Vector = {
  name: string;
  token: string;
  valid: boolean;
  reason?: string;
  claims?: Claims;
  mint?: { user: { id: string; name: string }; now: number; jti: string };
};
const vectors: Vector[] = [];
const ok = (name: string, c: Claims, extra: Partial<Vector> = {}) =>
  vectors.push({ name, token: token(c), valid: true, claims: c, ...extra });
const bad = (name: string, tok: string, reason: string) =>
  vectors.push({ name, token: tok, valid: false, reason });
const mint = (c: Claims) => ({
  mint: { user: { id: c.sub as string, name: c.name as string }, now: NOW, jti: c.jti as string },
});

const basic = claims();
ok("valid-basic", basic, mint(basic));
const uni = claims({ sub: "user/ünï-🎉", name: "Zoë 😀 日本語" }, 2);
ok("valid-unicode-name", uni, mint(uni));
const longSub = claims({ sub: "s".repeat(200), name: "n".repeat(80) }, 3);
ok("valid-max-length-sub-and-name", longSub, mint(longSub));
ok("valid-exp-30s-past-within-skew", claims({ exp: NOW - 10 }, 4));
ok("valid-exp-330s-ahead-limit", claims({ exp: NOW + 330 }, 5));

bad(
  "alg-none",
  `${b64('{"alg":"none","typ":"JWT"}')}.${b64(JSON.stringify(claims({}, 10)))}.`,
  "alg none",
);
{
  const h = b64('{"alg":"HS512","typ":"JWT"}');
  const p = b64(JSON.stringify(claims({}, 11)));
  bad("alg-hs512", `${h}.${p}.${sign(`${h}.${p}`, "sha512")}`, "alg HS512 (validly signed)");
}
bad(
  "header-reordered",
  token(claims({}, 12), '{"typ":"JWT","alg":"HS256"}'),
  "header is not exactly the required bytes",
);
bad(
  "header-with-space",
  token(claims({}, 13), '{"alg": "HS256", "typ": "JWT"}'),
  "header is not exactly the required bytes",
);
bad("two-segments", token(claims({}, 14)).split(".").slice(0, 2).join("."), "two segments");
bad("four-segments", `${token(claims({}, 15))}.extra`, "four segments");
{
  const good = token(claims({}, 16));
  bad("noncanonical-padding", `${good}=`, "base64url signature with '=' padding");
  const parts = good.split(".");
  const sig = parts[2]!;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = alphabet.indexOf(sig.at(-1)!);
  const alt = alphabet[(last & ~3) | (((last & 3) + 1) & 3)]!;
  bad(
    "noncanonical-trailing-bits",
    `${parts[0]}.${parts[1]}.${sig.slice(0, -1)}${alt}`,
    "signature decodes to the same bytes but is not the canonical encoding",
  );
  const std = Buffer.from(parts[1]!, "base64url").toString("base64");
  bad(
    "standard-base64-alphabet",
    `${parts[0]}.${std.replace(/=+$/, "")}x.${parts[2]}`,
    "payload not base64url",
  );
}
{
  const parts = token(claims({}, 17)).split(".");
  const sig = Buffer.from(parts[2]!, "base64url");
  sig[0] = sig[0]! ^ 1;
  bad(
    "bad-signature",
    `${parts[0]}.${parts[1]}.${sig.toString("base64url")}`,
    "signature mismatch",
  );
}
{
  const other = Buffer.alloc(32, 9);
  const h = b64(HEADER);
  const p = b64(JSON.stringify(claims({}, 18)));
  bad("signed-with-other-secret", `${h}.${p}.${sign(`${h}.${p}`, "sha256", other)}`, "wrong key");
}
bad("expired-31s", token(claims({ exp: NOW - 31 }, 20)), "exp more than 30s in the past");
bad("exp-too-far-331s", token(claims({ exp: NOW + 331 }, 21)), "exp more than 330s ahead");
bad("exp-string", token(claims({ exp: String(NOW + 300) }, 22)), "exp is not a number");
bad(
  "exp-missing",
  token(
    (() => {
      const c = claims({}, 23);
      delete c.exp;
      return c;
    })(),
  ),
  "exp missing",
);
bad("name-81-chars", token(claims({ name: "n".repeat(81) }, 24)), "name longer than 80");
bad("name-empty", token(claims({ name: "" }, 25)), "name empty");
bad("name-number", token(claims({ name: 5 }, 26)), "name not a string");
bad("sub-newline", token(claims({ sub: "host\nuser" }, 27)), "sub contains a newline");
bad("sub-empty", token(claims({ sub: "" }, 28)), "sub empty");
bad("sub-201-chars", token(claims({ sub: "s".repeat(201) }, 29)), "sub longer than 200");
bad(
  "jti-missing",
  token(
    (() => {
      const c = claims({}, 30);
      delete c.jti;
      return c;
    })(),
  ),
  "jti missing",
);
bad("jti-not-uuid", token(claims({ jti: "not-a-uuid" }, 31)), "jti is not a UUID");
bad("token-over-4kb", token(claims({ pad: "a".repeat(4200) }, 32)), "token longer than 4 KB");

const out = {
  _comment:
    "Test-only secret. `valid` vectors must verify against `secret` at `now` (epoch s); invalid ones must not, and must not consume the jti. Vectors with `mint` must be reproduced byte for byte by the signer given {user, now, jti} (payload key order: sub, name, exp, jti; exp = now + 300).",
  secret: SECRET,
  now: NOW,
  header: HEADER,
  vectors,
};
writeFileSync(
  new URL("../tests/fixtures/host-tokens.json", import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(`wrote ${vectors.length} vectors`);
