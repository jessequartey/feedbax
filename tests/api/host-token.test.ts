import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import vectors from "../fixtures/host-tokens.json";
import { consumeHostToken, verifyHostToken } from "../../src/server/host-token.ts";

beforeEach(resetEnv);
describe("host token verification", () => {
  for (const vector of vectors.vectors) {
    it(vector.name, async () => {
      if (vector.valid) {
        await expect(verifyHostToken(vector.token, vectors.secret, vectors.now)).resolves.toEqual(
          vector.claims,
        );
      } else {
        await expect(verifyHostToken(vector.token, vectors.secret, vectors.now)).rejects.toThrow();
      }
      expect(await env.DB.prepare("SELECT * FROM used_tokens").all()).toMatchObject({
        results: [],
      });
    });
  }
  it("consumes a jti once, including simultaneous arrivals", async () => {
    const claims = await verifyHostToken(vectors.vectors[0].token, vectors.secret, vectors.now);
    const results = await Promise.allSettled([consumeHostToken(claims), consumeHostToken(claims)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
