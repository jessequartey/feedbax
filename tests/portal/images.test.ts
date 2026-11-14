import { describe, expect, it } from "vite-plus/test";

import { fitWithin, screenIncoming } from "../../src/components/portal/images.ts";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("image screening", () => {
  it("accepts PNG, JPEG and WebP", () => {
    const { accepted, rejected } = screenIncoming(
      [file("a.png", "image/png"), file("b.jpg", "image/jpeg"), file("c.webp", "image/webp")],
      0,
    );
    expect(accepted).toHaveLength(3);
    expect(rejected).toEqual([]);
  });

  it.each(["image/gif", "image/svg+xml", "text/html", "application/pdf", ""])(
    "rejects %j",
    (type) => {
      expect(screenIncoming([file("x", type)], 0).rejected).toHaveLength(1);
    },
  );

  it("allows at most 3 images in total", () => {
    const { accepted, rejected } = screenIncoming(
      [file("1.png", "image/png"), file("2.png", "image/png"), file("3.png", "image/png")],
      1,
    );
    expect(accepted.map((f) => f.name)).toEqual(["1.png", "2.png"]);
    expect(rejected[0]?.reason).toMatch(/up to 3/);
  });

  it("rejects empty and absurdly large files", () => {
    expect(screenIncoming([file("e.png", "image/png", 0)], 0).rejected).toHaveLength(1);
    expect(
      screenIncoming([file("big.png", "image/png", 50 * 1024 * 1024)], 0).rejected,
    ).toHaveLength(1);
  });
});

describe("fitWithin", () => {
  it("leaves small images alone", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("scales the longest edge to 2560 and keeps the ratio", () => {
    expect(fitWithin(5120, 2560)).toEqual({ width: 2560, height: 1280 });
    expect(fitWithin(1000, 4000)).toEqual({ width: 640, height: 2560 });
  });
});
