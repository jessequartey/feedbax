import { describe, expect, it } from "vitest";
import {
  assertProductionConfiguration,
  defineFeedbax,
  type FeedbaxConfig,
} from "./index";

const properties = Object.fromEntries(
  [
    "title",
    "slug",
    "description",
    "type",
    "status",
    "published",
    "voteCount",
    "teamResponse",
    "releaseNotesUrl",
    "submitterName",
    "submitterEmail",
    "source",
    "externalId",
    "editTokenHash",
    "createdAt",
    "updatedAt",
  ].map((key) => [key, `${key}-id`]),
) as NonNullable<FeedbaxConfig["notion"]>["properties"];
const changelogProperties = Object.fromEntries(
  [
    "title",
    "slug",
    "date",
    "summary",
    "body",
    "labels",
    "image",
    "published",
    "createdAt",
    "updatedAt",
  ].map((key) => [key, `${key}-id`]),
) as NonNullable<FeedbaxConfig["changelog"]>["properties"];
const input: FeedbaxConfig = {
  product: {
    name: "Acme",
    description: "Acme feedback",
    logo: "/logo.svg",
    siteUrl: "https://feedback.example.com",
  },
  theme: { preset: "lyra-neutral" },
  notion: { databaseId: "db", dataSourceId: "source", properties },
  changelog: {
    databaseId: "changes-db",
    dataSourceId: "changes-source",
    properties: changelogProperties,
  },
  features: { voting: true, comments: true, changelog: true },
  submissions: {
    moderation: "required",
    maxTitleLength: 120,
    maxDescriptionLength: 5000,
  },
  turnstile: { enabled: false },
};

describe("Feedbax configuration", () => {
  it("selects GitHub without Notion or verified identity and rejects mixed providers", () => {
    const github = {
      installationId: "portal-acme",
      serviceUrl: "https://app.feedbax.example",
      repository: { id: 123, owner: "acme", name: "feedback" },
      botUserId: 456,
    };
    const configuration = {
      ...input,
      provider: "github",
      notion: undefined,
      changelog: undefined,
      features: { ...input.features, changelog: false },
      github,
    };
    const parsed = defineFeedbax(configuration as unknown as FeedbaxConfig);
    expect(parsed).toMatchObject({ provider: "github", github });
    expect(parsed.notion).toBeUndefined();
    expect(parsed.connected).toBeUndefined();
    expect(() =>
      defineFeedbax({
        ...configuration,
        notion: input.notion,
      } as unknown as FeedbaxConfig),
    ).toThrow("one Content Provider");
    expect(() =>
      defineFeedbax({
        ...configuration,
        features: input.features,
      } as unknown as FeedbaxConfig),
    ).toThrow("disable Changelog");
  });
  it("accepts the complete generated contract", () =>
    expect(defineFeedbax(input)).toEqual(input));
  it("requires enabled capability dependencies", () =>
    expect(() =>
      defineFeedbax({
        ...input,
        changelog: undefined,
      } as unknown as FeedbaxConfig),
    ).toThrow("Changelog is enabled"));
  it("rejects unknown and incomplete configuration", () => {
    expect(() =>
      defineFeedbax({ ...input, extra: true } as unknown as FeedbaxConfig),
    ).toThrow('Unknown Feedbax configuration key "extra"');
    expect(() =>
      defineFeedbax({
        ...input,
        product: { ...input.product, logo: "http://unsafe.test" },
      }),
    ).toThrow("product.logo must be root-relative or an HTTPS URL");
  });
  it("requires an absolute site URL only for production acceptance", () => {
    const local = defineFeedbax({
      ...input,
      product: { ...input.product, siteUrl: undefined },
    });
    expect(() =>
      assertProductionConfiguration(local, "development"),
    ).not.toThrow();
    expect(() => assertProductionConfiguration(local, "production")).toThrow(
      "product.siteUrl is required in production",
    );
  });
  it("requires a Turnstile site key when enabled", () =>
    expect(() =>
      defineFeedbax({ ...input, turnstile: { enabled: true } }),
    ).toThrow("turnstile.siteKey is missing"));
});

it.each(["/portal", "//example.com", "http://example.com"])(
  "rejects a non-HTTPS absolute site URL: %s",
  (siteUrl) => {
    expect(() =>
      defineFeedbax({ ...input, product: { ...input.product, siteUrl } }),
    ).toThrow("product.siteUrl must be an HTTPS URL");
  },
);

it("keeps Connected Profile opt-in and rejects secrets and unsafe handoff configuration", () => {
  const connected = {
    issuer: "https://app.example.com",
    loginUrl: "https://app.example.com/login",
  };
  expect(defineFeedbax({ ...input, connected }).connected).toEqual(connected);
  expect(defineFeedbax(input).connected).toBeUndefined();
  expect(() =>
    defineFeedbax({
      ...input,
      product: { ...input.product, siteUrl: undefined },
      connected,
    }),
  ).toThrow("siteUrl");
  expect(() =>
    defineFeedbax({
      ...input,
      connected: { ...connected, loginUrl: "http://app.example.com/login" },
    }),
  ).toThrow("HTTPS");
  expect(() =>
    defineFeedbax({
      ...input,
      connected: { ...connected, secret: "never-public" },
    } as unknown as FeedbaxConfig),
  ).toThrow("Unknown connected key");
});
