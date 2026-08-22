// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  capabilitiesKey,
  deviceProfileKey,
  readCapabilities,
  readDeviceProfile,
} from "./browser-post-state";
import { DeviceProfileControl } from "./device-profile-control";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("Device Profile control", () => {
  it("explains device-only storage and saves required Participant details", async () => {
    render(<DeviceProfileControl />);
    fireEvent.click(screen.getByText("Profile"));

    expect(
      screen.getByText(
        /Saved only on this device.*not sign-in.*cannot be recovered/i,
      ),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Ama Mensah" },
    });
    fireEvent.change(screen.getByLabelText("Email (optional)"), {
      target: { value: "ama@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(readDeviceProfile(localStorage)).toEqual({
      name: "Ama Mensah",
      email: "ama@example.com",
    });
    expect(screen.getByText("AM")).toBeTruthy();
  });

  it("loads an existing profile for editing and clears it without authorization", async () => {
    const capability = {
      id: "post-id",
      slug: "keyboard-navigation",
      browserCapability: "secret-capability",
    };
    localStorage.setItem(deviceProfileKey, JSON.stringify({ name: "Ama" }));
    localStorage.setItem(
      capabilitiesKey,
      JSON.stringify({ [capability.id]: capability }),
    );

    render(<DeviceProfileControl />);
    await waitFor(() => expect(screen.getByText("A")).toBeTruthy());
    fireEvent.click(screen.getByText("A"));
    expect(screen.getByLabelText("Display name")).toHaveProperty(
      "value",
      "Ama",
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear profile" }));

    expect(readDeviceProfile(localStorage)).toBeUndefined();
    expect(readCapabilities(localStorage)).toEqual({
      [capability.id]: capability,
    });
  });
});
