// Screenshot capture. Browser only; `modern-screenshot` is loaded lazily so SSR and first paint stay light.
export const IGNORE_ATTRIBUTE = "data-feedbax-ignore";

export class CaptureCancelledError extends Error {
  constructor() {
    super("Capture was cancelled.");
    this.name = "CaptureCancelledError";
  }
}
export class CaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureError";
  }
}

export const canCaptureScreen = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Resolves once the given element is no longer in the document (or after `timeout` ms). */
export async function waitUntilGone(selector: string, timeout = 1200): Promise<void> {
  const start = performance.now();
  while (document.querySelector(selector) && performance.now() - start < timeout) await wait(30);
  await nextFrame();
  await nextFrame();
}

function pageBackground(): string {
  for (const el of [document.body, document.documentElement]) {
    const color = getComputedStyle(el).backgroundColor;
    if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
  }
  return "white";
}

/** Nodes the snapshot leaves out: anything marked `data-feedbax-ignore`, and the dialog overlay. */
export const isIgnored = (node: Node): boolean =>
  node instanceof Element &&
  (node.hasAttribute(IGNORE_ATTRIBUTE) || node.getAttribute("data-slot") === "dialog-overlay");

/**
 * Captures what the user currently sees: the visible viewport of this page, as a PNG.
 * Elements marked `data-feedbax-ignore` (the dialog, its overlay, anything the host marks) are left out.
 * Known limits: cross-origin images without CORS, iframes, video frames and some CSS effects.
 */
export async function captureViewport(): Promise<Blob> {
  const { domToBlob } = await import("modern-screenshot");
  const root = document.documentElement;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // `position: fixed` elements are re-anchored by the library's scroll restoration. We remember the
  // originals in clone order (filter runs pre-order, onCloneEachNode post-order, so a stack lines up)
  // and move them back to where they are on screen.
  const stack: Array<Element | null> = [];
  const filter = (node: Node): boolean => {
    if (isIgnored(node)) return false;
    if (node.nodeType === Node.TEXT_NODE) return true; // text nodes never reach onCloneEachNode
    stack.push(
      (scrollX || scrollY) && node instanceof Element && getComputedStyle(node).position === "fixed"
        ? node
        : null,
    );
    return true;
  };
  const onCloneEachNode = (cloned: Node) => {
    const original = stack.pop();
    if (original && cloned instanceof HTMLElement && original.localName === cloned.localName)
      cloned.style.setProperty("translate", `${scrollX}px ${scrollY}px`);
  };

  try {
    return await domToBlob(root, {
      width: root.clientWidth,
      height: window.innerHeight,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      type: "image/png",
      backgroundColor: pageBackground(),
      filter,
      onCloneEachNode,
      features: { restoreScrollPosition: true },
      timeout: 15_000,
    });
  } catch (error) {
    throw new CaptureError(
      error instanceof Error ? error.message : "The page could not be captured.",
    );
  }
}

/**
 * Captures a frame of the screen (or tab) through the browser's own picker.
 * `beforeFrame` runs after the user has chosen what to share and before the frame is read:
 * the dialog hides itself there so it is not part of the picture. Every track is always stopped.
 */
export async function captureScreen(
  options: { beforeFrame?: () => Promise<void> } = {},
): Promise<Blob> {
  if (!canCaptureScreen())
    throw new CaptureError("Screen capture is not available in this browser.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
      preferCurrentTab: true,
    } as DisplayMediaStreamOptions);
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "NotAllowedError" || error.name === "AbortError")
    )
      throw new CaptureCancelledError();
    throw new CaptureError("Screen capture could not start.");
  }

  const video = document.createElement("video");
  try {
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new CaptureError("Screen capture could not start."));
    });
    await video.play();
    await options.beforeFrame?.();
    // Give the compositor time to deliver a frame that no longer contains the dialog.
    await wait(250);
    if ("requestVideoFrameCallback" in video)
      await new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve()));
    if (stream.getVideoTracks().every((track) => track.readyState === "ended"))
      throw new CaptureCancelledError();

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width === 0)
      throw new CaptureError("Screen capture returned an empty frame.");
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new CaptureError("Screen capture returned an empty frame.");
    return blob;
  } finally {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  }
}
