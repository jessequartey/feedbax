export const capabilitiesKey = "feedbax:post-capabilities";
export const deviceProfileKey = "feedbax:device-profile";
export interface DeviceProfile {
  name: string;
  email?: string;
}

type DeviceProfileStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
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
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    const entries = Object.keys(value);
    const name = Reflect.get(value, "name");
    const email = Reflect.get(value, "email");
    if (
      entries.some((key) => key !== "name" && key !== "email") ||
      typeof name !== "string" ||
      name.trim().length === 0 ||
      (email !== undefined && typeof email !== "string")
    ) {
      return undefined;
    }
    return {
      name: name.trim(),
      ...(typeof email === "string" && email.trim()
        ? { email: email.trim() }
        : {}),
    };
  } catch {
    return undefined;
  }
}

export function saveDeviceProfile(
  storage: Pick<DeviceProfileStorage, "setItem">,
  profile: DeviceProfile,
) {
  const name = profile.name.trim();
  if (!name) throw new Error("Device Profile display name is required.");
  const email = profile.email?.trim();
  storage.setItem(
    deviceProfileKey,
    JSON.stringify({ name, ...(email ? { email } : {}) }),
  );
}

export function clearDeviceProfile(
  storage: Pick<DeviceProfileStorage, "removeItem">,
) {
  storage.removeItem(deviceProfileKey);
}

export function deriveDeviceProfileInitials(profile: DeviceProfile): string {
  return profile.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");
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
