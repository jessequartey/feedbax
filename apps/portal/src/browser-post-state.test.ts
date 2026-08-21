import { describe, expect, it } from "vitest";
import {
  capabilitiesKey,
  deviceProfileKey,
  readCapabilities,
  readDeviceProfile,
  retainCapability,
} from "./browser-post-state";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("device-local Post state", () => {
  it("retains several Browser Capabilities independently", () => {
    const storage = memoryStorage();
    retainCapability(storage, {
      id: "one",
      slug: "one",
      browserCapability: "secret-one",
    });
    retainCapability(storage, {
      id: "two",
      slug: "two",
      browserCapability: "secret-two",
    });
    expect(Object.keys(readCapabilities(storage))).toEqual(["one", "two"]);
  });
  it("reads a Device Profile separately from capabilities", () => {
    const storage = memoryStorage();
    storage.setItem(
      deviceProfileKey,
      JSON.stringify({ name: "Ada Lovelace", email: "ada@example.com" }),
    );
    storage.setItem(
      capabilitiesKey,
      JSON.stringify({
        one: { id: "one", slug: "one", browserCapability: "secret" },
      }),
    );
    expect(readDeviceProfile(storage)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(readCapabilities(storage)).toHaveProperty("one");
    storage.removeItem(deviceProfileKey);
    expect(readCapabilities(storage)).toHaveProperty("one");
  });
});
