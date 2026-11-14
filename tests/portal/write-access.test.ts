import { describe, expect, it } from "vite-plus/test";

import { backToAppUrl, decideWrite } from "../../src/components/portal/write-access.ts";
import { accountUser, anonymousUser, hostUser } from "../fixtures/portal.ts";
import { viewerOf } from "./helpers.tsx";

describe("write access", () => {
  it("lets signed-in people write", () => {
    expect(decideWrite(viewerOf(accountUser))).toBe("ok");
    expect(decideWrite(viewerOf(hostUser))).toBe("ok");
  });

  it("sends signed-out people to /login when anonymous mode is off", () => {
    expect(decideWrite(viewerOf(null))).toBe("login");
  });

  it("creates an anonymous session lazily when anonymous mode is on", () => {
    expect(decideWrite(viewerOf(null, { anonymous: true }))).toBe("anonymous");
    expect(decideWrite(viewerOf(anonymousUser, { anonymous: true }))).toBe("ok");
  });

  it("stops leftover anonymous sessions once the flag is turned off", () => {
    expect(decideWrite(viewerOf(anonymousUser, { anonymous: false }))).toBe("login");
  });

  it("offers Back to app only to host identities with an appUrl", () => {
    const appUrl = "https://app.example.com";
    expect(backToAppUrl(viewerOf(hostUser, { appUrl }))).toBe(appUrl);
    expect(backToAppUrl(viewerOf(hostUser, { appUrl: null }))).toBeNull();
    expect(backToAppUrl(viewerOf(accountUser, { appUrl }))).toBeNull();
    expect(backToAppUrl(viewerOf(anonymousUser, { appUrl }))).toBeNull();
    expect(backToAppUrl(viewerOf(null, { appUrl }))).toBeNull();
  });
});
