// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ConnectedIdentityProvider } from "./components/connected-identity-provider";
import { VoteToggle } from "./vote-toggle";
vi.mock("./feedbax", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./feedbax")>();
  return {
    default: {
      ...actual.default,
      connected: {
        issuer: "https://app.example",
        loginUrl: "https://app.example/login",
      },
    },
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});
it("restores a signed-in Participant's Vote from the server instead of device storage", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = String(input);
    if (url === "/internal/identity/session")
      return Response.json({ participant: { displayName: "Alice" } });
    if (url.startsWith("/internal/connected/votes?"))
      return Response.json({ voted: true, voteCount: 4 });
    return Response.json({ slug: "post", voteCount: 3, voted: false });
  });
  vi.stubGlobal("fetch", request);
  render(
    <ConnectedIdentityProvider>
      <VoteToggle
        post={{
          slug: "post",
          title: "Post",
          description: "Description",
          type: "Feature Request",
          status: "Planned",
          createdAt: new Date(),
          updatedAt: new Date(),
          voteCount: 4,
        }}
      />
    </ConnectedIdentityProvider>,
  );
  const button = await screen.findByRole("button", {
    name: "Remove Vote, 4 Votes",
  });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Add Vote, 3 Votes" }),
    ).toBeTruthy(),
  );
  expect(localStorage.length).toBe(0);
});
