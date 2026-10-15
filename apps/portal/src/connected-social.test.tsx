// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectedIdentityProvider } from "./components/connected-identity-provider";
import { FollowPostButton } from "./components/follow-post-button";
import { NotificationInbox } from "./components/notification-inbox";
import { ImageAttachments } from "./components/image-attachments";
import type { ImageAttachment } from "@feedbax/feedback";
vi.mock("./feedbax", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./feedbax")>();
  return {
    default: {
      ...actual.default,
      connected: {
        issuer: "https://app.example",
        loginUrl: "https://app.example/login",
        images: true,
      },
    },
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("follows a Post and manages private read and email preferences from the inbox", async () => {
  let following = false,
    read = false,
    email = false;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const path = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (path === "/internal/identity/session")
        return Response.json({ participant: { displayName: "Alice" } });
      if (path.includes("/follow")) {
        if (body) following = body.following;
        return Response.json({ following });
      }
      if (path.includes("/preferences")) {
        if (body) email = body.emailEnabled;
        return Response.json({ emailAvailable: true, emailEnabled: email });
      }
      if (body) {
        read = true;
        return Response.json({ updated: true });
      }
      return Response.json({
        unreadCount: read ? 0 : 1,
        items: [
          {
            id: "a".repeat(32),
            slug: "post",
            kind: "status",
            title: "Image uploads",
            message: "Status changed to Shipped.",
            createdAt: Date.now(),
            read,
          },
        ],
      });
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ConnectedIdentityProvider>
        <FollowPostButton slug="post" />
        <NotificationInbox />
      </ConnectedIdentityProvider>
    </QueryClientProvider>,
  );
  const follow = await screen.findByRole("button", { name: "Follow updates" });
  await waitFor(() => expect(follow.hasAttribute("disabled")).toBe(false));
  fireEvent.click(follow);
  await screen.findByRole("button", { name: "Following" });
  expect(following).toBe(true);
  fireEvent.click(
    await screen.findByRole("button", { name: "Notifications, 1 unread" }),
  );
  await screen.findByText("Status changed to Shipped.");
  fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
  await screen.findByText("0 unread");
  const toggle = await screen.findByRole("switch", {
    name: "Email notifications",
  });
  fireEvent.click(toggle);
  await waitFor(() => expect(email).toBe(true));
  client.clear();
});
it("uploads and removes image previews without submitting the surrounding form", async () => {
  let submitted = false;
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (String(input).includes("identity/session"))
        return Response.json({ participant: { displayName: "Alice" } });
      calls.push(init?.method ?? "GET");
      return Response.json(
        init?.method === "DELETE"
          ? { removed: true }
          : {
              id: "11111111-2222-3333-4444-555555555555",
              src: "/internal/images/example",
              contentType: "image/png",
              bytes: 68,
            },
      );
    }),
  );
  function Composer() {
    const [images, setImages] = useState<ImageAttachment[]>([]);
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = true;
        }}
      >
        <ImageAttachments value={images} onChange={setImages} />
      </form>
    );
  }
  render(
    <ConnectedIdentityProvider>
      <Composer />
    </ConnectedIdentityProvider>,
  );
  const input = await screen.findByLabelText("Choose image attachments");
  fireEvent.change(input, {
    target: {
      files: [
        new File([new Uint8Array([137, 80, 78, 71])], "sample.png", {
          type: "image/png",
        }),
      ],
    },
  });
  await screen.findByAltText("Attached image 1");
  fireEvent.click(screen.getByRole("button", { name: "Remove image 1" }));
  await waitFor(() =>
    expect(screen.queryByAltText("Attached image 1")).toBeNull(),
  );
  expect(calls).toEqual(["POST", "DELETE"]);
  expect(submitted).toBe(false);
});
