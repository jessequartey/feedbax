export type PortalFeatures = {
  readonly voting: boolean;
  readonly comments: boolean;
  readonly changelog: boolean;
};
export type ProductConfiguration = {
  readonly name: string;
  readonly description: string;
  readonly logo: string;
  readonly siteUrl?: string;
  readonly supportUrl?: string;
  readonly privacyUrl?: string;
};
export type FeedbackPropertyIds = {
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly type: string;
  readonly status: string;
  readonly published: string;
  readonly voteCount: string;
  readonly teamResponse: string;
  readonly releaseNotesUrl: string;
  readonly submitterName: string;
  readonly submitterEmail: string;
  readonly source: string;
  readonly externalId: string;
  readonly editTokenHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};
export type ChangelogPropertyIds = {
  readonly title: string;
  readonly slug: string;
  readonly date: string;
  readonly summary: string;
  readonly body: string;
  readonly labels: string;
  readonly image: string;
  readonly published: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};
export type NotionConfiguration = {
  readonly databaseId: string;
  readonly dataSourceId: string;
  readonly properties: FeedbackPropertyIds;
};
export type ChangelogConfiguration = {
  readonly databaseId: string;
  readonly dataSourceId: string;
  readonly properties: ChangelogPropertyIds;
};
export type EmailConfiguration = {
  readonly provider: "cloudflare" | "resend" | "custom";
  readonly from: string;
  readonly endpoint?: string;
};
export type ConnectedConfiguration = {
  readonly email?: EmailConfiguration;
  readonly images?: boolean;
  readonly issuer: string;
  readonly loginUrl: string;
};
export type FeedbaxConfig = {
  readonly connected?: ConnectedConfiguration;
  readonly product: ProductConfiguration;
  readonly theme: { readonly preset: string };
  readonly notion: NotionConfiguration;
  readonly changelog?: ChangelogConfiguration;
  readonly features: PortalFeatures;
  readonly submissions: {
    readonly moderation: "required";
    readonly maxTitleLength: number;
    readonly maxDescriptionLength: number;
  };
  readonly turnstile: { readonly enabled: boolean; readonly siteKey?: string };
};

const rootKeys = [
  "connected",
  "product",
  "theme",
  "notion",
  "changelog",
  "features",
  "submissions",
  "turnstile",
];
const featureKeys = ["voting", "comments", "changelog"] as const;
const feedbackPropertyKeys = [
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
] as const;
const changelogPropertyKeys = [
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
] as const;

export function defineFeedbax(config: FeedbaxConfig): FeedbaxConfig;
export function defineFeedbax(config: unknown): FeedbaxConfig {
  const value = object(config, "Feedbax configuration");
  rejectUnknown(value, rootKeys, "Feedbax configuration");
  const product = object(value.product, "product");
  rejectUnknown(
    product,
    ["name", "description", "logo", "siteUrl", "supportUrl", "privacyUrl"],
    "product",
  );
  const validatedProduct: ProductConfiguration = {
    name: text(product.name, "product.name"),
    description: text(product.description, "product.description"),
    logo: publicUrl(product.logo, "product.logo", true),
    ...optionalPublicUrl(product, "siteUrl"),
    ...optionalPublicUrl(product, "supportUrl"),
    ...optionalPublicUrl(product, "privacyUrl"),
  };
  let connected: ConnectedConfiguration | undefined;
  if (value.connected !== undefined) {
    const input = object(value.connected, "connected");
    rejectUnknown(
      input,
      ["issuer", "loginUrl", "email", "images"],
      "connected",
    );
    const issuer = publicUrl(input.issuer, "connected.issuer", false);
    const loginUrl = publicUrl(input.loginUrl, "connected.loginUrl", false);
    if (!validatedProduct.siteUrl)
      throw new Error("Connected Profile requires product.siteUrl.");
    if (
      new URL(loginUrl).username ||
      new URL(loginUrl).password ||
      new URL(loginUrl).hash
    )
      throw new Error(
        "connected.loginUrl must not contain credentials or a fragment.",
      );
    let email: EmailConfiguration | undefined;
    if (input.email !== undefined) {
      const sender = object(input.email, "connected.email");
      rejectUnknown(
        sender,
        ["provider", "from", "endpoint"],
        "connected.email",
      );
      if (!["cloudflare", "resend", "custom"].includes(String(sender.provider)))
        throw new Error(
          "connected.email.provider must be cloudflare, resend, or custom.",
        );
      const from = text(sender.from, "connected.email.from");
      if (from.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from))
        throw new Error(
          "connected.email.from must be a plain sender email address.",
        );
      const endpoint =
        sender.endpoint === undefined
          ? undefined
          : publicUrl(sender.endpoint, "connected.email.endpoint", false);
      if (sender.provider === "custom" && !endpoint)
        throw new Error("Custom email requires connected.email.endpoint.");
      if (sender.provider !== "custom" && endpoint)
        throw new Error("Only custom email uses connected.email.endpoint.");
      if (
        endpoint &&
        (new URL(endpoint).username ||
          new URL(endpoint).password ||
          new URL(endpoint).hash)
      )
        throw new Error(
          "Custom email endpoint must not contain credentials or a fragment.",
        );
      email = {
        provider: sender.provider as EmailConfiguration["provider"],
        from,
        ...(endpoint ? { endpoint } : {}),
      };
    }
    if (input.images !== undefined && typeof input.images !== "boolean")
      throw new Error("connected.images must be true or false.");
    connected = {
      issuer,
      loginUrl,
      ...(email ? { email } : {}),
      ...(input.images !== undefined ? { images: input.images } : {}),
    };
  }
  const theme = object(value.theme, "theme");
  rejectUnknown(theme, ["preset"], "theme");
  const notion = storage(
    value.notion,
    feedbackPropertyKeys,
    "notion",
  ) as NotionConfiguration;
  const features = object(value.features, "features");
  rejectUnknown(features, featureKeys, "features");
  const validatedFeatures = Object.fromEntries(
    featureKeys.map((key) => {
      if (typeof features[key] !== "boolean")
        throw new Error(`features.${key} must be true or false.`);
      return [key, features[key]];
    }),
  ) as PortalFeatures;
  const changelog =
    value.changelog === undefined
      ? undefined
      : (storage(
          value.changelog,
          changelogPropertyKeys,
          "changelog",
        ) as ChangelogConfiguration);
  if (validatedFeatures.changelog && !changelog)
    throw new Error(
      "Changelog is enabled but changelog storage is not configured. Add changelog identifiers and property mappings, or set features.changelog to false.",
    );
  const submissions = object(value.submissions, "submissions");
  rejectUnknown(
    submissions,
    ["moderation", "maxTitleLength", "maxDescriptionLength"],
    "submissions",
  );
  if (submissions.moderation !== "required")
    throw new Error('submissions.moderation must be "required".');
  const turnstile = object(value.turnstile, "turnstile");
  rejectUnknown(turnstile, ["enabled", "siteKey"], "turnstile");
  if (typeof turnstile.enabled !== "boolean")
    throw new Error("turnstile.enabled must be true or false.");
  const siteKey =
    turnstile.siteKey === undefined
      ? undefined
      : text(turnstile.siteKey, "turnstile.siteKey");
  if (turnstile.enabled && !siteKey)
    throw new Error("Turnstile is enabled but turnstile.siteKey is missing.");
  return {
    product: validatedProduct,
    ...(connected ? { connected } : {}),
    theme: { preset: text(theme.preset, "theme.preset") },
    notion,
    ...(changelog ? { changelog } : {}),
    features: validatedFeatures,
    submissions: {
      moderation: "required",
      maxTitleLength: positiveInteger(
        submissions.maxTitleLength,
        "submissions.maxTitleLength",
      ),
      maxDescriptionLength: positiveInteger(
        submissions.maxDescriptionLength,
        "submissions.maxDescriptionLength",
      ),
    },
    turnstile: { enabled: turnstile.enabled, ...(siteKey ? { siteKey } : {}) },
  };
}

export function assertProductionConfiguration(
  config: FeedbaxConfig,
  environment = process.env.NODE_ENV,
): void {
  if (environment === "production" && !config.product.siteUrl)
    throw new Error(
      "product.siteUrl is required in production so canonical and social metadata use an absolute URL.",
    );
}
function storage(value: unknown, keys: readonly string[], label: string) {
  const input = object(value, label);
  rejectUnknown(input, ["databaseId", "dataSourceId", "properties"], label);
  const properties = object(input.properties, `${label}.properties`);
  rejectUnknown(properties, keys, `${label}.properties`);
  for (const key of keys) text(properties[key], `${label}.properties.${key}`);
  return {
    databaseId: text(input.databaseId, `${label}.databaseId`),
    dataSourceId: text(input.dataSourceId, `${label}.dataSourceId`),
    properties: { ...properties },
  };
}
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}
function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0)
    throw new Error(`${label} must be a positive integer.`);
  return Number(value);
}
function rejectUnknown(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
) {
  const key = Object.keys(value).find(
    (candidate) => !allowed.includes(candidate),
  );
  if (key) throw new Error(`Unknown ${label} key "${key}".`);
}
function optionalPublicUrl(
  value: Record<string, unknown>,
  key: "siteUrl" | "supportUrl" | "privacyUrl",
) {
  return value[key] === undefined
    ? {}
    : { [key]: publicUrl(value[key], `product.${key}`, false) };
}
function publicUrl(
  value: unknown,
  label: string,
  allowRelative: boolean,
): string {
  const url = text(value, label);
  if (
    allowRelative &&
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    !Array.from(url).some((character) => character.charCodeAt(0) <= 32)
  )
    return url;
  try {
    if (new URL(url).protocol === "https:") return url;
  } catch {
    // The actionable validation error below is intentionally shared by parse
    // failures and unsupported protocols.
  }
  throw new Error(
    `${label} must be ${allowRelative ? "root-relative or " : ""}an HTTPS URL.`,
  );
}
