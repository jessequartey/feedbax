import { useEffect, useState, type FormEvent } from "react";
import {
  clearDeviceProfile,
  deriveDeviceProfileInitials,
  readDeviceProfile,
  saveDeviceProfile,
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
    saveDeviceProfile(localStorage, next);
    setProfile(next);
  }
  const initials = profile ? deriveDeviceProfileInitials(profile) : undefined;
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
                clearDeviceProfile(localStorage);
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
