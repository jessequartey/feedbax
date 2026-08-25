import { describe, expect, it } from "vitest";

import { defineFeedbax } from "./index";

describe("Feedbax feature configuration", () => {
  it("enables every optional capability by default", () => {
    expect(defineFeedbax({}).features).toEqual({
      voting: true,
      comments: true,
      changelog: true,
    });
  });

  it("accepts independent explicit opt-outs", () => {
    expect(
      defineFeedbax({
        features: { voting: false, comments: true, changelog: false },
      }).features,
    ).toEqual({ voting: false, comments: true, changelog: false });
  });

  it.each([
    [{ features: { voting: "yes" } }, "features.voting must be true or false"],
    [{ features: { sharing: true } }, 'Unknown feature "sharing"'],
  ])(
    "rejects invalid startup configuration with repair guidance",
    (input, message) => {
      expect(() => defineFeedbax(input as never)).toThrow(message);
    },
  );
});
