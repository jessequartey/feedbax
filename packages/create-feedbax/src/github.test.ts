import { expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { provisionGitHubInstallation } from "./github";
it("creates a GitHub-only Installation with explicit D1, independent identity, and private pairing material", async () => {
  const root = await mkdtemp(join(tmpdir(), "feedbax-github-setup-"));
  const destination = join(root, "portal");
  try {
    const result = await provisionGitHubInstallation({
      destination,
      product: {
        name: "Acme",
        description: "Feedback",
        siteUrl: "https://portal.account.workers.dev",
      },
      workerName: "acme-feedback",
      database: {
        id: "11111111-2222-3333-4444-555555555555",
        name: "acme-feedback",
      },
      github: {
        installationId: "portal-acme",
        serviceUrl: "https://service.example",
        repository: { id: 123, owner: "acme", name: "feedback" },
        botUserId: 456,
      },
      features: { voting: true, comments: true, changelog: false },
      preview: async () => true,
    });
    const source = await readFile(join(destination, "src/feedbax.ts"), "utf8");
    expect(source).toContain('"provider": "github"');
    expect(source).not.toContain('"notion"');
    expect(source).not.toContain('"connected"');
    const wrangler = JSON.parse(
      await readFile(join(destination, "wrangler.jsonc"), "utf8"),
    );
    expect(wrangler.d1_databases).toEqual([
      {
        binding: "FEEDBAX_DB",
        database_id: "11111111-2222-3333-4444-555555555555",
        database_name: "acme-feedback",
        migrations_dir: "migrations",
      },
    ]);
    expect(wrangler.triggers.crons).toEqual(["*/5 * * * *"]);
    const secrets = await readFile(join(destination, ".dev.vars"), "utf8");
    expect(secrets).toContain("GITHUB_PAIRING_SECRET=");
    expect(secrets).not.toContain("NOTION_TOKEN");
    expect(source).not.toContain(result.pairingSecret);
    expect((await stat(join(destination, ".dev.vars"))).mode & 0o777).toBe(
      0o600,
    );
    expect(secrets).not.toContain(result.apiKey);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
