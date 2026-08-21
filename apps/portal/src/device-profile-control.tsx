import { useEffect, useState, type FormEvent } from "react";
import {
  deviceProfileKey,
  readDeviceProfile,
  type DeviceProfile,
} from "./browser-post-state";
import { useTheme } from "next-themes";

export function DeviceProfileControl() {
  const [profile, setProfile] = useState<DeviceProfile>();
  const { theme, setTheme } = useTheme();
  useEffect(() => setProfile(readDeviceProfile(localStorage)), []);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = {
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim() || undefined,
    };
    if (!next.name) return;
    localStorage.setItem(deviceProfileKey, JSON.stringify(next));
    setProfile(next);
  }
  const initials = profile?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <details className="profile-control">
      <summary>{initials || "Profile"}</summary>
      <div className="profile-panel">
        <p>
          Saved only on this device. This is not sign-in and cannot be
          recovered.
        </p>
        <form onSubmit={save}>
          <label>
            Display name
            <input name="name" required defaultValue={profile?.name} />
          </label>
          <label>
            Email (optional)
            <input name="email" type="email" defaultValue={profile?.email} />
          </label>
          <button type="submit">Save profile</button>
          {profile ? (
            <button
              type="button"
              onClick={() => {
                localStorage.removeItem(deviceProfileKey);
                setProfile(undefined);
              }}
            >
              Clear profile
            </button>
          ) : null}
        </form>
        <label>
          Theme
          <select
            value={theme ?? "system"}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
    </details>
  );
}
