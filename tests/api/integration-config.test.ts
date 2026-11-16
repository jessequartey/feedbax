import { describe, expect, it } from "vite-plus/test";
import { defineConfig } from "../../src/contracts/config.ts";
import { integrationSettings, issueLabels } from "../../src/server/integration-config.ts";
const config = defineConfig({
  integrations: { notion: { dataSourceId: "00000000-0000-0000-0000-000000000000" }, github: false },
});
describe("runtime GitHub approval integration", () => {
  it("stays off by default and validates explicit repository and label settings", () => {
    expect(integrationSettings(config, {}).github).toBe(false);
    expect(
      integrationSettings(config, {
        FEEDBAX_GITHUB_ENABLED: "true",
        FEEDBAX_GITHUB_REPO: "acme/app",
      }).github,
    ).toEqual({ repo: "acme/app" });
    expect(() =>
      integrationSettings(config, {
        FEEDBAX_GITHUB_ENABLED: "true",
        FEEDBAX_GITHUB_REPO: "https://evil.test",
      }),
    ).toThrow();
    expect(issueLabels("needs-triage,agent-candidate")).toEqual([
      "needs-triage",
      "agent-candidate",
    ]);
    expect(() => issueLabels("unsafe\nlabel")).toThrow();
  });
});
