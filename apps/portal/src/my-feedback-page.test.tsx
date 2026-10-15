// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectedIdentityProvider } from "./components/connected-identity-provider";
import { MyFeedbackPage } from "./my-feedback-page";
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
it("switches private filters with accessible tabs and edits an eligible draft without browser-held authority", async () => {
  const user = userEvent.setup();
  let title = "My pending feedback";
  let edited: unknown;
  const post = () => ({
    id: "post-1",
    slug: "my-pending-feedback",
    title,
    description: "A private pending description",
    type: "Feature Request",
    status: "New",
    published: false,
    editable: true,
    createdAt: "2026-10-15T12:00:00Z",
    updatedAt: "2026-10-15T12:00:00Z",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === "/internal/identity/session")
        return Response.json({
          participant: { displayName: "Alice", sessionKey: "alice-session" },
        });
      if (path.startsWith("/internal/my-feedback?"))
        return Response.json({
          items: path.includes("filter=submitted")
            ? [post()]
            : [
                {
                  slug: "supported",
                  title: "Supported public feedback",
                  published: true,
                  editable: false,
                },
              ],
        });
      if (path === "/internal/my-feedback/post") {
        const body = JSON.parse(String(init?.body));
        if (body.action === "edit") {
          edited = body;
          title = body.title;
        }
        return Response.json(post());
      }
      throw new Error("Unexpected browser request");
    }),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ConnectedIdentityProvider>
        <MyFeedbackPage />
      </ConnectedIdentityProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("My pending feedback")).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Supported" }));
  expect(await screen.findByText("Supported public feedback")).toBeTruthy();
  await user.click(screen.getByRole("tab", { name: "Submitted" }));
  await user.click(await screen.findByRole("button", { name: "Edit draft" }));
  const field = screen.getByLabelText("Title");
  await user.clear(field);
  await user.type(field, "Updated on this device");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(edited).toMatchObject({
      id: "post-1",
      title: "Updated on this device",
      action: "edit",
    }),
  );
  expect(JSON.stringify(edited)).not.toContain("browserCapability");
  expect(JSON.stringify(edited)).not.toContain("subject");
  expect(await screen.findByText("Updated on this device")).toBeTruthy();
});

it("discards private lists and open editors when a refreshed session changes even with the same display name", async () => {
  const user = userEvent.setup();
  let current = "alice";
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input) === "/internal/identity/session")
        return Response.json({
          participant: { displayName: "Shared name", sessionKey: current },
        });
      const post = {
        id: `${current}-post`,
        slug: `${current}-post`,
        title: `${current} private draft`,
        description: "Private details",
        type: "General Feedback",
        status: "New",
        published: false,
        editable: true,
      };
      if (String(input).startsWith("/internal/my-feedback?"))
        return Response.json({ items: [post] });
      if (String(input) === "/internal/my-feedback/post")
        return Response.json(post);
      throw Error("Unexpected request");
    }),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ConnectedIdentityProvider>
        <MyFeedbackPage />
      </ConnectedIdentityProvider>
    </QueryClientProvider>,
  );
  expect(await screen.findByText("alice private draft")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Edit draft" }));
  expect(await screen.findByLabelText("Title")).toBeTruthy();
  current = "bob";
  window.dispatchEvent(new Event("focus"));
  expect(await screen.findByText("bob private draft")).toBeTruthy();
  expect(screen.queryByText("alice private draft")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});
