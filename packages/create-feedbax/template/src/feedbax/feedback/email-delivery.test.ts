import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createFetchMock, Miniflare } from "miniflare";
import ts from "typescript";

it.each([200, 302])(
  "sends email inside the actual Workers fetch runtime and rejects provider redirects (%s)",
  async (status) => {
    const source = await readFile(
      new URL("./email-delivery.ts", import.meta.url),
      "utf8",
    );
    const sender = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    const network = createFetchMock();
    network.disableNetConnect();
    network
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(status, "{}", {
        headers:
          status === 302 ? { location: "https://unexpected.example/leak" } : {},
      });
    let redirected = 0;
    network
      .get("https://unexpected.example")
      .intercept({ path: "/leak", method: "GET" })
      .reply(() => {
        redirected++;
        return { statusCode: 200, data: "{}" };
      });
    const runtime = new Miniflare({
      compatibilityDate: "2026-07-30",
      modulesRoot: "/email-worker",
      fetchMock: network,
      modules: [
        {
          type: "ESModule",
          path: "/email-worker/entry.mjs",
          contents: `import {createEmailSender} from './sender.mjs'; export default {async fetch(){ try {await createEmailSender({provider:'resend',token:'test-provider-key'})({from:'updates@example.com',to:['recipient@example.com'],subject:'Update',text:'A Post changed.',headers:{}},'test-stable-key');return new Response('accepted');}catch(error){return new Response(error.message,{status:502});}}};`,
        },
        {
          type: "ESModule",
          path: "/email-worker/sender.mjs",
          contents: sender,
        },
      ],
    });
    try {
      const response = await runtime.dispatchFetch(
        "https://worker.example/send",
      );
      expect(await response.text()).not.toContain("test-provider-key");
      expect(response.status).toBe(status === 200 ? 200 : 502);
      expect(redirected).toBe(0);
    } finally {
      await runtime.dispose();
      await network.close();
    }
  },
);
