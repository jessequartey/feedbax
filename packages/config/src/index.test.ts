import { describe, expect, it } from "vitest";

import { defineFeedbax } from "./index";

describe("Feedbax feature configuration", () => {
  it("uses the built-in mark until a Deployer assigns a logo", () => {
    expect(defineFeedbax({ features: { changelog: false } }).product.logo).toBe(
      "/feedbax-mark.svg",
    );
    expect(
      defineFeedbax({
        product: { logo: "/brand/acme.svg" },
        features: { changelog: false },
      }).product.logo,
    ).toBe("/brand/acme.svg");
  });

  it("rejects an empty assigned logo", () => {
    expect(() =>
      defineFeedbax({
        product: { logo: "  " },
        features: { changelog: false },
      }),
    ).toThrow("product.logo must be a non-empty asset URL");
  });

  it("enables every optional capability by default and requires enabled Changelog storage", () => {
    expect(() => defineFeedbax({})).toThrow(
      "Changelog is enabled but changelog storage is not configured",
    );
    expect(defineFeedbax({ changelog: changelogConfig }).features).toEqual({
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

  it("accepts the complete stable Changelog mapping", () => {
    expect(defineFeedbax({ changelog: changelogConfig }).changelog).toEqual(
      changelogConfig,
    );
  });

  it("rejects incomplete or unknown Changelog configuration", () => {
    expect(() =>
      defineFeedbax({ changelog: { ...changelogConfig, dataSourceId: "" } }),
    ).toThrow("changelog.dataSourceId must be a non-empty string");
    expect(() =>
      defineFeedbax({
        changelog: {
          ...changelogConfig,
          propertyIds: { ...changelogConfig.propertyIds, extra: "id" },
        },
      } as never),
    ).toThrow('Unknown Changelog property mapping "extra"');
  });
});

const changelogConfig = {
  databaseId: "database-id",
  dataSourceId: "data-source-id",
  propertyIds: {
    title: "title-id",
    slug: "slug-id",
    date: "date-id",
    summary: "summary-id",
    body: "body-id",
    labels: "labels-id",
    image: "image-id",
    published: "published-id",
    createdAt: "created-id",
    updatedAt: "updated-id",
  },
};
