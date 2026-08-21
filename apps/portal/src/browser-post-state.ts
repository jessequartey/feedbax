export const capabilitiesKey = "feedbax:post-capabilities";
export const deviceProfileKey = "feedbax:device-profile";
export interface DeviceProfile {
  name: string;
  email?: string;
}
export interface StoredPostCapability {
  id: string;
  slug: string;
  browserCapability: string;
}

export function readDeviceProfile(
  storage: Pick<Storage, "getItem">,
): DeviceProfile | undefined {
  try {
    const value = JSON.parse(
      storage.getItem(deviceProfileKey) ?? "null",
    ) as unknown;
    return value &&
      typeof value === "object" &&
      typeof Reflect.get(value, "name") === "string"
      ? (value as DeviceProfile)
      : undefined;
  } catch {
    return undefined;
  }
}
export function readCapabilities(
  storage: Pick<Storage, "getItem">,
): Record<string, StoredPostCapability> {
  try {
    const value = JSON.parse(
      storage.getItem(capabilitiesKey) ?? "{}",
    ) as unknown;
    return value && typeof value === "object"
      ? (value as Record<string, StoredPostCapability>)
      : {};
  } catch {
    return {};
  }
}
export function retainCapability(
  storage: Pick<Storage, "getItem" | "setItem">,
  capability: StoredPostCapability,
) {
  storage.setItem(
    capabilitiesKey,
    JSON.stringify({
      ...readCapabilities(storage),
      [capability.id]: capability,
    }),
  );
}
export function removeCapability(
  storage: Pick<Storage, "getItem" | "setItem">,
  id: string,
) {
  const capabilities = readCapabilities(storage);
  delete capabilities[id];
  storage.setItem(capabilitiesKey, JSON.stringify(capabilities));
}
