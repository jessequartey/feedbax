import { describe, expect, it } from "vitest";

import {
  capabilitiesKey,
  clearDeviceProfile,
  deriveDeviceProfileInitials,
  deviceProfileKey,
  isCompleteDeviceProfile,
  readCapabilities,
  readDeviceProfile,
  retainCapability,
  saveDeviceProfile,
} from "./browser-post-state";

describe("device-local Participant state", () => {
  it("persists a valid Device Profile and derives its initials", () => {
    const storage = memoryStorage();

    saveDeviceProfile(storage, {
      name: "  Ama Mensah  ",
      email: "  ama@example.com  ",
    });

    expect(readDeviceProfile(storage)).toEqual({
      name: "Ama Mensah",
      email: "ama@example.com",
    });
    expect(deriveDeviceProfileInitials(readDeviceProfile(storage)!)).toBe("AM");
    expect(isCompleteDeviceProfile(readDeviceProfile(storage))).toBe(true);
  });

  it("preserves a legacy name-only profile but treats it as incomplete", () => {
    const storage = memoryStorage({
      [deviceProfileKey]: JSON.stringify({ name: "Ama" }),
    });

    expect(readDeviceProfile(storage)).toEqual({ name: "Ama" });
    expect(isCompleteDeviceProfile(readDeviceProfile(storage))).toBe(false);
  });

  it("treats malformed email addresses as incomplete", () => {
    const storage = memoryStorage({
      [deviceProfileKey]: JSON.stringify({
        name: "Ama",
        email: "not-an-email",
      }),
    });

    expect(isCompleteDeviceProfile(readDeviceProfile(storage))).toBe(false);
  });

  it("rejects malformed saved profiles", () => {
    const malformedProfiles = [
      null,
      {},
      { name: "" },
      { name: "Ama", email: 42 },
      { name: "Ama", extra: "unexpected" },
    ];

    for (const profile of malformedProfiles) {
      const storage = memoryStorage({
        [deviceProfileKey]: JSON.stringify(profile),
      });
      expect(readDeviceProfile(storage)).toBeUndefined();
    }
  });

  it("clears only the Device Profile and preserves Browser Capabilities", () => {
    const capability = {
      id: "post-id",
      slug: "keyboard-navigation",
      browserCapability: "secret-capability",
    };
    const storage = memoryStorage({
      [deviceProfileKey]: JSON.stringify({ name: "Ama" }),
      [capabilitiesKey]: JSON.stringify({ [capability.id]: capability }),
    });

    clearDeviceProfile(storage);

    expect(readDeviceProfile(storage)).toBeUndefined();
    expect(readCapabilities(storage)).toEqual({ [capability.id]: capability });
  });

  it("retains several valid Browser Capabilities and ignores malformed saved entries", () => {
    const storage = memoryStorage({
      [capabilitiesKey]: JSON.stringify({
        malformed: { id: "malformed", slug: "missing-secret" },
      }),
    });
    const first = {
      id: "post-1",
      slug: "keyboard-navigation",
      browserCapability: "first-secret",
    };
    const second = {
      id: "post-2",
      slug: "dark-mode",
      browserCapability: "second-secret",
    };

    retainCapability(storage, first);
    retainCapability(storage, second);

    expect(readCapabilities(storage)).toEqual({
      [first.id]: first,
      [second.id]: second,
    });
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
