import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { previewPublishedSourceUpgrade } from "./upgrade-baseline";
let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
it("rejects a changed registry archive before touching installed source", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-baseline-integrity-"));
  const installation = join(directory, "installation"),
    target = join(directory, "target.json");
  await mkdir(join(installation, "src"), { recursive: true });
  await writeFile(
    join(installation, "package.json"),
    JSON.stringify({ private: true, devDependencies: { feedbax: "0.2.1" } }),
  );
  await writeFile(join(installation, "src/feedbax.ts"), "private config");
  await writeFile(join(installation, "wrangler.jsonc"), "{}");
  await writeFile(join(installation, "app.ts"), "keep this customization");
  const bytes = Buffer.from("target source");
  await writeFile(
    target,
    JSON.stringify({
      format: 1,
      version: "0.2.2",
      files: [
        {
          path: "app.ts",
          bytes: bytes.toString("base64"),
          sha256: createHash("sha256").update(bytes).digest("hex"),
          mode: 0o644,
        },
      ],
    }),
  );
  const request = vi.fn<typeof fetch>(
    async () => new Response("corrupt archive"),
  );
  await expect(
    previewPublishedSourceUpgrade({
      installation,
      fromVersion: "0.2.1",
      target,
      request,
    }),
  ).rejects.toThrow("integrity");
  expect(await readFile(join(installation, "app.ts"), "utf8")).toBe(
    "keep this customization",
  );
  await expect(
    readFile(join(installation, ".feedbax/source-upgrade.json")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses a source upgrade outside a generated Installation", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-wrong-directory-"));
  const request = vi.fn<typeof fetch>(
    async () => new Response("must not fetch"),
  );
  await expect(
    previewPublishedSourceUpgrade({
      installation: directory,
      fromVersion: "0.2.1",
      request,
    }),
  ).rejects.toThrow("generated Feedbax Installation");
  expect(request).not.toHaveBeenCalled();
});
