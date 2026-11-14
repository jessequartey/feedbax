import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { mintFeedbaxToken } from "../../registry/feedbax-feedback/lib/token.server.ts";

type Vector = {
  name: string;
  token: string;
  valid: boolean;
  mint?: { user: { id: string; name: string }; now: number; jti: string };
};
const vectors = JSON.parse(
  readFileSync(new URL("../fixtures/host-tokens.json", import.meta.url), "utf8"),
) as {
  secret: string;
  vectors: Vector[];
};

describe("mintFeedbaxToken", () => {
  const minted = vectors.vectors.filter((v) => v.mint);

  test("there are vectors to check", () => {
    expect(minted.length).toBeGreaterThanOrEqual(3);
  });

  for (const vector of minted) {
    test(`matches the pinned token: ${vector.name}`, async () => {
      const { user, now, jti } = vector.mint!;
      expect(await mintFeedbaxToken({ secret: vectors.secret, user, now, jti })).toBe(vector.token);
    });
  }

  test("defaults: a fresh UUID jti and exp five minutes from now", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await mintFeedbaxToken({
      secret: vectors.secret,
      user: { id: "u1", name: "Ada" },
    });
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(Object.keys(claims)).toEqual(["sub", "name", "exp", "jti"]);
    expect(claims.exp).toBeGreaterThanOrEqual(before + 300);
    expect(claims.exp).toBeLessThanOrEqual(before + 302);
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    const again = await mintFeedbaxToken({
      secret: vectors.secret,
      user: { id: "u1", name: "Ada" },
    });
    expect(JSON.parse(Buffer.from(again.split(".")[1], "base64url").toString()).jti).not.toBe(
      claims.jti,
    );
  });

  test("refuses input the portal would reject", async () => {
    const secret = vectors.secret;
    await expect(mintFeedbaxToken({ secret, user: { id: "", name: "Ada" } })).rejects.toThrow(
      /user\.id/,
    );
    await expect(mintFeedbaxToken({ secret, user: { id: "a\nb", name: "Ada" } })).rejects.toThrow(
      /user\.id/,
    );
    await expect(
      mintFeedbaxToken({ secret, user: { id: "x".repeat(201), name: "Ada" } }),
    ).rejects.toThrow(/user\.id/);
    await expect(mintFeedbaxToken({ secret, user: { id: "u", name: "" } })).rejects.toThrow(
      /user\.name/,
    );
    await expect(
      mintFeedbaxToken({ secret, user: { id: "u", name: "n".repeat(81) } }),
    ).rejects.toThrow(/user\.name/);
    await expect(
      mintFeedbaxToken({ secret: "not base64url!", user: { id: "u", name: "Ada" } }),
    ).rejects.toThrow(/base64url/);
    await expect(
      mintFeedbaxToken({ secret: "AAAA", user: { id: "u", name: "Ada" } }),
    ).rejects.toThrow(/short/);
  });
});
