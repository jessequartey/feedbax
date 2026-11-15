// @vitest-environment happy-dom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../src/components/portal/command-palette", async () => {
  const { DialogContent, DialogTitle } = await import("../../src/components/ui/dialog.tsx");
  return {
    default: () => (
      <DialogContent>
        <DialogTitle>Search feedback and changelog</DialogTitle>
      </DialogContent>
    ),
  };
});
import {
  CommandSearch,
  CommandSearchTrigger,
} from "../../src/components/portal/command-search.tsx";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("command search trigger", () => {
  it("opens the one palette dialog when a search box is clicked", async () => {
    await act(async () =>
      root.render(
        <>
          <CommandSearch />
          <CommandSearchTrigger />
        </>,
      ),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const trigger = container.querySelector("button")!;
    await act(async () => trigger.click());
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  });
});
