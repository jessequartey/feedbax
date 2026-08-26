import { describe, expect, it } from "vitest";

import { createPortalHead } from "./portal-head";

describe("portal document branding", () => {
  it("uses the resolved product logo as the favicon", () => {
    expect(createPortalHead({ logo: "/brand/acme.svg" }).links).toContainEqual({
      rel: "icon",
      href: "/brand/acme.svg",
    });
  });
});
