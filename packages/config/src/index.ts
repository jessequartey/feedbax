export type PortalFeatures = {
  readonly voting: boolean;
  readonly comments: boolean;
  readonly changelog: boolean;
};

export type FeedbaxConfigInput = {
  readonly features?: Partial<PortalFeatures>;
};

export type FeedbaxConfig = {
  readonly features: PortalFeatures;
};

const defaultFeatures: PortalFeatures = {
  voting: true,
  comments: true,
  changelog: true,
};

const featureKeys = Object.keys(defaultFeatures) as (keyof PortalFeatures)[];

export function defineFeedbax(config: FeedbaxConfigInput): FeedbaxConfig;
export function defineFeedbax(config: unknown): FeedbaxConfig {
  if (!isRecord(config)) {
    throw new Error("Feedbax configuration must be an object.");
  }

  const unknownRootKey = Object.keys(config).find((key) => key !== "features");
  if (unknownRootKey) {
    throw new Error(
      `Unknown Feedbax configuration key "${unknownRootKey}". Remove it from feedbax.ts.`,
    );
  }

  const configuredFeatures = config.features;
  if (configuredFeatures === undefined) {
    return { features: { ...defaultFeatures } };
  }
  if (!isRecord(configuredFeatures)) {
    throw new Error(
      "features must be an object containing capability switches.",
    );
  }

  const unknownFeature = Object.keys(configuredFeatures).find(
    (key) => !featureKeys.includes(key as keyof PortalFeatures),
  );
  if (unknownFeature) {
    throw new Error(
      `Unknown feature "${unknownFeature}". Supported features are voting, comments, and changelog.`,
    );
  }

  for (const key of featureKeys) {
    const value = configuredFeatures[key];
    if (value !== undefined && typeof value !== "boolean") {
      throw new Error(`features.${key} must be true or false.`);
    }
  }

  return {
    features: {
      ...defaultFeatures,
      ...configuredFeatures,
    },
  } as FeedbaxConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
