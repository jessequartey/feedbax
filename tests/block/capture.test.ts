import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import {
  canCaptureScreen,
  CaptureCancelledError,
  CaptureError,
  captureScreen,
  isIgnored,
} from "../../registry/feedbax-feedback/lib/capture.ts";

afterEach(() => vi.unstubAllGlobals());

function track() {
  return { readyState: "live", stop: vi.fn() };
}
function setup(options: { getDisplayMedia?: () => Promise<unknown>; width?: number } = {}) {
  const tracks = [track(), track()];
  const stream = { getTracks: () => tracks, getVideoTracks: () => tracks };
  const video = {
    muted: false,
    playsInline: false,
    videoWidth: options.width ?? 640,
    videoHeight: 360,
    onloadedmetadata: null as null | (() => void),
    onerror: null as null | (() => void),
    play: vi.fn(async () => {}),
    _src: null as unknown,
    set srcObject(value: unknown) {
      this._src = value;
      if (value) queueMicrotask(() => this.onloadedmetadata?.());
    },
    get srcObject() {
      return this._src;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["png"], { type: "image/png" })),
  };
  const getDisplayMedia = vi.fn(options.getDisplayMedia ?? (async () => stream));
  vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia } });
  vi.stubGlobal("document", { createElement: (tag: string) => (tag === "video" ? video : canvas) });
  return { tracks, video, getDisplayMedia };
}

describe("screen capture", () => {
  test("canCaptureScreen follows navigator.mediaDevices.getDisplayMedia", () => {
    vi.stubGlobal("navigator", {});
    expect(canCaptureScreen()).toBe(false);
    vi.stubGlobal("navigator", { mediaDevices: {} });
    expect(canCaptureScreen()).toBe(false);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: () => {} } });
    expect(canCaptureScreen()).toBe(true);
  });

  test("returns a PNG, asks for the current tab, and stops every track", async () => {
    const { tracks, getDisplayMedia, video } = setup();
    const blob = await captureScreen();
    expect(blob.type).toBe("image/png");
    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: true,
      audio: false,
      preferCurrentTab: true,
    });
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  test("beforeFrame runs after the stream exists and before the frame is read", async () => {
    const order: string[] = [];
    const { getDisplayMedia, video } = setup();
    getDisplayMedia.mockImplementationOnce(async () => {
      order.push("picked");
      return { getTracks: () => [], getVideoTracks: () => [track()] };
    });
    video.play.mockImplementation(async () => void order.push("playing"));
    await captureScreen({ beforeFrame: async () => void order.push("hide dialog") });
    expect(order).toEqual(["picked", "playing", "hide dialog"]);
  });

  test("a cancelled picker is a quiet CaptureCancelledError and nothing is left running", async () => {
    setup({
      getDisplayMedia: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    });
    await expect(captureScreen()).rejects.toBeInstanceOf(CaptureCancelledError);
  });

  test("a failure while grabbing the frame still stops every track", async () => {
    const { tracks } = setup({ width: 0 });
    await expect(captureScreen()).rejects.toBeInstanceOf(CaptureError);
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });

  test("an error thrown by beforeFrame still stops every track", async () => {
    const { tracks } = setup();
    await expect(
      captureScreen({
        beforeFrame: async () => {
          throw new Error("hide failed");
        },
      }),
    ).rejects.toThrow("hide failed");
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
  });

  test("unsupported browsers get a CaptureError, not a crash", async () => {
    vi.stubGlobal("navigator", {});
    await expect(captureScreen()).rejects.toBeInstanceOf(CaptureError);
  });
});

describe("DOM snapshot filter", () => {
  class FakeElement {
    attrs: Record<string, string>;
    constructor(attrs: Record<string, string>) {
      this.attrs = attrs;
    }
    hasAttribute(name: string) {
      return name in this.attrs;
    }
    getAttribute(name: string) {
      return this.attrs[name] ?? null;
    }
  }
  test("skips the dialog, its overlay, secret fields and anything the host marks", () => {
    vi.stubGlobal("Element", FakeElement);
    expect(isIgnored(new FakeElement({ "data-feedbax-ignore": "" }) as unknown as Node)).toBe(true);
    expect(isIgnored(new FakeElement({ "data-slot": "dialog-overlay" }) as unknown as Node)).toBe(
      true,
    );
    expect(isIgnored(new FakeElement({ "data-slot": "button" }) as unknown as Node)).toBe(false);
    expect(isIgnored({ nodeType: 3 } as unknown as Node)).toBe(false);
    for (const attrs of [{ type: "password" }, { autocomplete: "one-time-code" }] as Record<
      string,
      string
    >[])
      expect(isIgnored(new FakeElement(attrs) as unknown as Node)).toBe(true);
  });
});
