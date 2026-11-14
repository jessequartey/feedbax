import { describe, expect, it } from "vite-plus/test";

import { NotificationSettings } from "../../src/components/portal/notification-settings.tsx";
import type { EmailSettings } from "../../src/contracts/portal.ts";
import { accountUser } from "../fixtures/portal.ts";
import { renderPage, viewerOf } from "./helpers.tsx";

const settings = (patch: Partial<EmailSettings> = {}): EmailSettings => ({
  enabled: true,
  address: "ada@example.com",
  admin: false,
  prefs: { status: true, replies: true, changelog: false, digest: true },
  ...patch,
});

describe("email notification settings", () => {
  it("shows the address and one labelled switch per choice, with the saved state", async () => {
    const html = await renderPage(
      <NotificationSettings settings={settings()} />,
      viewerOf(accountUser),
    );
    expect(html).toContain("ada@example.com");
    for (const label of ["Status changes", "Replies", "Changelog entries"])
      expect(html).toContain(label);
    expect(html).not.toContain("Admin digest");
    expect(html.match(/role="switch"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
  });

  it("offers the digest to admins only", async () => {
    const html = await renderPage(
      <NotificationSettings settings={settings({ admin: true })} />,
      viewerOf(accountUser),
    );
    expect(html).toContain("Admin digest");
    expect(html.match(/role="switch"/g)).toHaveLength(4);
  });

  it("explains when email is off or the account has no address, with no switches", async () => {
    const off = await renderPage(
      <NotificationSettings settings={settings({ enabled: false })} />,
      viewerOf(accountUser),
    );
    expect(off).toContain("Email notifications are off");
    const none = await renderPage(
      <NotificationSettings settings={settings({ address: null })} />,
      viewerOf(accountUser),
    );
    expect(none).toContain("No email address on this account");
    expect(off + none).not.toContain('role="switch"');
  });
});
