import { describe, expect, it } from "vitest";

import {
  capabilitiesKey,
  clearDeviceProfile,
  deriveDeviceProfileInitials,
  deviceProfileKey,
  readCapabilities,
  readDeviceProfile,
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
});

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}
