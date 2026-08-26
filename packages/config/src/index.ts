export type PortalFeatures = {
  readonly voting: boolean;
  readonly comments: boolean;
  readonly changelog: boolean;
};

export type FeedbaxConfigInput = {
  readonly features?: Partial<PortalFeatures>;
  readonly changelog?: ChangelogConfiguration;
};

export type FeedbaxConfig = {
  readonly features: PortalFeatures;
  readonly changelog?: ChangelogConfiguration;
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

export type ChangelogConfiguration = {
  readonly databaseId: string;
  readonly dataSourceId: string;
  readonly propertyIds: ChangelogPropertyIds;
};

const defaultFeatures: PortalFeatures = {
  voting: true,
  comments: true,
  changelog: true,
};

const featureKeys = Object.keys(defaultFeatures) as (keyof PortalFeatures)[];
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
] as const satisfies readonly (keyof ChangelogPropertyIds)[];

export function defineFeedbax(config: FeedbaxConfigInput): FeedbaxConfig;
export function defineFeedbax(config: unknown): FeedbaxConfig {
  if (!isRecord(config)) {
    throw new Error("Feedbax configuration must be an object.");
  }

  const unknownRootKey = Object.keys(config).find(
    (key) => key !== "features" && key !== "changelog",
  );
  if (unknownRootKey) {
    throw new Error(
      `Unknown Feedbax configuration key "${unknownRootKey}". Remove it from feedbax.ts.`,
    );
  }

  const configuredFeatures = config.features;
  if (configuredFeatures !== undefined && !isRecord(configuredFeatures)) {
    throw new Error(
      "features must be an object containing capability switches.",
    );
  }

  const featureInput = configuredFeatures ?? {};
  const unknownFeature = Object.keys(featureInput).find(
    (key) => !featureKeys.includes(key as keyof PortalFeatures),
  );
  if (unknownFeature) {
    throw new Error(
      `Unknown feature "${unknownFeature}". Supported features are voting, comments, and changelog.`,
    );
  }

  for (const key of featureKeys) {
    const value = featureInput[key];
    if (value !== undefined && typeof value !== "boolean") {
      throw new Error(`features.${key} must be true or false.`);
    }
  }

  const features = { ...defaultFeatures, ...featureInput } as PortalFeatures;
  const changelog = validateChangelogConfiguration(config.changelog);
  if (features.changelog && !changelog) {
    throw new Error(
      "Changelog is enabled but changelog storage is not configured. Add changelog database/data-source identifiers and property IDs, or set features.changelog to false.",
    );
  }
  return { features, ...(changelog ? { changelog } : {}) };
}

function validateChangelogConfiguration(
  value: unknown,
): ChangelogConfiguration | undefined {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error("changelog must be an object.");
  const unknownKey = Object.keys(value).find(
    (key) => !["databaseId", "dataSourceId", "propertyIds"].includes(key),
  );
  if (unknownKey)
    throw new Error(`Unknown Changelog configuration key "${unknownKey}".`);
  for (const key of ["databaseId", "dataSourceId"] as const) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      throw new Error(`changelog.${key} must be a non-empty string.`);
    }
  }
  if (!isRecord(value.propertyIds)) {
    throw new Error(
      "changelog.propertyIds must contain the canonical property mapping.",
    );
  }
  const unknownProperty = Object.keys(value.propertyIds).find(
    (key) => !changelogPropertyKeys.includes(key as keyof ChangelogPropertyIds),
  );
  if (unknownProperty) {
    throw new Error(`Unknown Changelog property mapping "${unknownProperty}".`);
  }
  for (const key of changelogPropertyKeys) {
    if (
      typeof value.propertyIds[key] !== "string" ||
      !value.propertyIds[key].trim()
    ) {
      throw new Error(
        `changelog.propertyIds.${key} must be a non-empty string.`,
      );
    }
  }
  return {
    databaseId: value.databaseId as string,
    dataSourceId: value.dataSourceId as string,
    propertyIds: { ...value.propertyIds } as ChangelogPropertyIds,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
