import { expect, it } from "vitest";
import { createParticipationRequestHandler } from "./participation-runtime";

it("keeps social routes private and rejects cross-origin mutations before touching participation", async () => {
  let read = false;
  const handler = createParticipationRequestHandler({
    siteUrl: "https://feedback.example.com",
    enabled: true,
    getParticipant: async () => undefined,
    getModule: () => {
      read = true;
      throw new Error();
    },
    rateLimit: async () => true,
  });
  const privateRead = await handler(
    new Request(
      "https://feedback.example.com/internal/connected/notifications",
    ),
  );
  expect(privateRead?.status).toBe(401);
  expect(privateRead?.headers.get("Cache-Control")).toBe("no-store");
  const mutation = await handler(
    new Request("https://feedback.example.com/internal/connected/follow", {
      method: "POST",
      headers: { Origin: "https://evil.example.com" },
      body: JSON.stringify({ slug: "public", following: true }),
    }),
  );
  expect(mutation?.status).toBe(403);
  expect(read).toBe(false);
  expect(
    await handler(new Request("https://feedback.example.com/roadmap")),
  ).toBeUndefined();
});
