// Reproducible, credential-free recording: the real @clack/prompts UI with fakes.
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "../../packages/create-feedbax/src/index.ts";
import { buildTemplate } from "../../scripts/package-template.ts";
import { fakeClients, fakeCloudflare } from "./fakes.ts";
const cwd = await mkdtemp(join(tmpdir(), "feedbax-demo-"));
const templateDir = join(cwd, "template");
buildTemplate({ out: templateDir });
try {
  const cloudflare = fakeCloudflare();
  process.exitCode = await main([], {
    cwd,
    templateDir,
    clients: fakeClients(),
    run: cloudflare.run,
    fetch: cloudflare.fetch,
    env: { npm_config_user_agent: "npm/12.2.2" },
  });
} finally {
  await rm(cwd, { recursive: true, force: true });
}
