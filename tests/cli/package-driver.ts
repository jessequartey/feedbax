// Test-only providers injected into the actual packed entry point. Production has
// no fake-provider environment flags and never accepts provider base URLs.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { fakeClients, portalResponse } from "./fakes.ts";
const packedPath = process.argv[2]!;
const cli = (await import(pathToFileURL(packedPath).href)) as {
  main: (argv: string[], deps: unknown) => Promise<number>;
};
const fetch: typeof globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (!url.startsWith("https://api.cloudflare.com/"))
    return portalResponse(join(process.cwd(), "my-feedback"), url, init);
  const state = JSON.parse(readFileSync(process.env.FEEDBAX_TEST_STATE!, "utf8"));
  if ((input instanceof Request ? input.url : input.toString()).includes("/r2/buckets"))
    return Response.json({
      success: true,
      result: { buckets: state.bucket ? [{ name: "my-feedback-images" }] : [] },
    });
  if ((input instanceof Request ? input.url : input.toString()).includes("/queues?"))
    return Response.json({
      success: true,
      result: [
        ...(state.queue ? [{ queue_name: "my-feedback-sync" }] : []),
        ...(state.notifyQueue ? [{ queue_name: "my-feedback-notify" }] : []),
      ],
    });
  return Response.json({ success: true, result: { subdomain: "team" } });
};
process.exitCode = await cli.main(process.argv.slice(3), { clients: fakeClients(), fetch });
