import type { SignedHandoffConfig } from '@feedbax/auth-handoff'
import type { ConnectorDescriptor } from '@feedbax/core'
import type { NotionSetupConfig } from '@feedbax/notion'
import { Schema } from 'effect'

const decodeOptions = { onExcessProperty: 'error' } as const
const runtimeSchema = <S extends Schema.Schema.AnyNoContext>(schema: S) =>
  Object.assign(schema, {
    parse: (input: unknown): S['Type'] =>
      Schema.decodeUnknownSync(schema)(input, decodeOptions),
    safeParse: (
      input: unknown,
    ):
      | { readonly success: true; readonly data: S['Type'] }
      | { readonly success: false; readonly error: unknown } => {
      try {
        return {
          success: true,
          data: Schema.decodeUnknownSync(schema)(input, decodeOptions),
        }
      } catch (error) {
        return { success: false, error }
      }
    },
  })

const nonEmpty = Schema.Trim.pipe(
  Schema.minLength(1, {
    message: () => 'Too small: expected a non-empty string',
  }),
)
const positiveInt = Schema.Int.pipe(Schema.positive())
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const LOCAL_ASSET_EXTENSIONS = {
  logo: new Set(['.svg', '.png', '.webp', '.jpg', '.jpeg']),
  favicon: new Set(['.svg', '.png', '.ico']),
  socialPreviewImage: new Set(['.png', '.jpg', '.jpeg', '.webp']),
} as const

export type BrandAssetKind = keyof typeof LOCAL_ASSET_EXTENSIONS

const httpUrl = Schema.String.pipe(
  Schema.filter(
    (value) => {
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol)
      } catch {
        return false
      }
    },
    { message: () => 'Expected an HTTP(S) URL' },
  ),
)
const httpsUrl = Schema.String.pipe(
  Schema.filter(
    (value) => {
      try {
        return new URL(value).protocol === 'https:'
      } catch {
        return false
      }
    },
    { message: () => 'Expected an HTTPS URL' },
  ),
)
const hexColorRaw = Schema.transform(
  Schema.String.pipe(
    Schema.pattern(HEX_COLOR, {
      message: () => 'Expected a six-digit hex color such as #2563eb',
    }),
  ),
  Schema.String.pipe(Schema.brand('HexColor')),
  {
    strict: true,
    decode: (value) => value.toLowerCase() as `#${string}`,
    encode: (value) => value,
  },
)
export const HexColorSchema = runtimeSchema(hexColorRaw)

function assetExtension(value: string) {
  const pathname = value.startsWith('/') ? value : new URL(value).pathname
  const index = pathname.lastIndexOf('.')
  return index === -1 ? '' : pathname.slice(index).toLowerCase()
}

const brandAssetRaw = (kind: BrandAssetKind) =>
  nonEmpty.pipe(
    Schema.filter(
      (value) => {
        if (value.startsWith('/'))
          return !value.startsWith('//') && !value.includes('..')
        try {
          return new URL(value).protocol === 'https:'
        } catch {
          return false
        }
      },
      { message: () => 'Expected a safe root-relative path or HTTPS URL' },
    ),
    Schema.filter(
      (value) => LOCAL_ASSET_EXTENSIONS[kind].has(assetExtension(value)),
      { message: () => `Unsupported ${kind} file type` },
    ),
  )
export function brandAssetSchema(kind: BrandAssetKind) {
  return runtimeSchema(brandAssetRaw(kind))
}

function relativeLuminance(color: string) {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255,
  )
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}
export function contrastRatio(first: string, second: string) {
  const high = Math.max(relativeLuminance(first), relativeLuminance(second))
  const low = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (high + 0.05) / (low + 0.05)
}
export function readableAccentForeground(
  accentColor: string,
): '#000000' | '#ffffff' {
  return contrastRatio(accentColor, '#000000') >= 4.5 ? '#000000' : '#ffffff'
}

const brandThemeRaw = Schema.Struct({
  background: hexColorRaw,
  surface: hexColorRaw,
  text: hexColorRaw,
  mutedText: hexColorRaw,
  border: hexColorRaw,
})
export const BrandThemeSchema = runtimeSchema(brandThemeRaw)

const navigationLinkRaw = Schema.Struct({
  label: nonEmpty,
  href: nonEmpty.pipe(
    Schema.filter(
      (value) => {
        if (value.startsWith('/') && !value.startsWith('//')) return true
        try {
          return new URL(value).protocol === 'https:'
        } catch {
          return false
        }
      },
      {
        message: () =>
          'Navigation destinations must be root-relative or HTTPS URLs',
      },
    ),
  ),
})
const brandingRaw = Schema.Struct({
  productName: nonEmpty,
  description: nonEmpty,
  logo: brandAssetRaw('logo'),
  favicon: brandAssetRaw('favicon'),
  socialPreviewImage: Schema.optional(brandAssetRaw('socialPreviewImage')),
  accentColor: hexColorRaw,
  themes: Schema.Struct({ light: brandThemeRaw, dark: brandThemeRaw }),
  navigation: Schema.Array(navigationLinkRaw).pipe(Schema.minItems(1)),
  supportUrl: Schema.optional(
    Schema.Union(
      httpsUrl,
      Schema.String.pipe(Schema.pattern(/^mailto:[^\s@]+@[^\s@]+$/)),
    ),
  ),
  poweredByFeedbax: Schema.Boolean,
}).pipe(
  Schema.filter(
    (branding) => {
      const destinations = branding.navigation.map(({ href }) => href)
      return new Set(destinations).size === destinations.length
    },
    { message: () => 'Navigation destinations must be unique' },
  ),
  Schema.filter(
    (branding) => {
      for (const mode of ['light', 'dark'] as const) {
        const theme = branding.themes[mode]
        for (const [foreground, background] of [
          [theme.text, theme.background],
          [theme.text, theme.surface],
          [theme.mutedText, theme.background],
          [theme.mutedText, theme.surface],
        ] as const)
          if (contrastRatio(foreground, background) < 4.5) return false
        for (const background of [theme.background, theme.surface])
          if (contrastRatio(branding.accentColor, background) < 3) return false
      }
      return true
    },
    {
      message: () => 'Brand colors must meet the required 4.5:1 contrast ratio',
    },
  ),
)

const mutationActionProtectionRaw = Schema.Struct({
  limit: positiveInt,
  windowSeconds: positiveInt,
  captcha: Schema.optional(Schema.Boolean),
})
export const MutationActionProtectionSchema = runtimeSchema(
  mutationActionProtectionRaw,
)
const allowedOriginRaw = Schema.String.pipe(
  Schema.filter(
    (value) => {
      try {
        const url = new URL(value)
        return (
          ['https:', 'http:'].includes(url.protocol) && url.origin === value
        )
      } catch {
        return false
      }
    },
    { message: () => 'Expected an exact HTTP origin' },
  ),
)
const mutationProtectionRaw = Schema.Struct({
  allowedOrigins: Schema.optional(Schema.Array(allowedOriginRaw)),
  maximumBodyBytes: Schema.optional(
    positiveInt.pipe(Schema.lessThanOrEqualTo(1_000_000)),
  ),
  request: mutationActionProtectionRaw,
  actions: Schema.Struct({
    submit: mutationActionProtectionRaw,
    vote: mutationActionProtectionRaw,
    comment: mutationActionProtectionRaw,
    subscribe: mutationActionProtectionRaw,
  }),
})
const mutationProtectionRuntime = runtimeSchema(mutationProtectionRaw)
export const MutationProtectionConfigSchema = mutationProtectionRuntime as Omit<
  typeof mutationProtectionRuntime,
  'parse'
> & {
  readonly parse: (input: unknown) => MutationProtectionConfig
}
type DeepMutable<T> = T extends
  string | number | boolean | bigint | symbol | null | undefined
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : T extends ReadonlyArray<infer Item>
      ? DeepMutable<Item>[]
      : T extends object
        ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
        : T
export type MutationProtectionConfig = DeepMutable<
  typeof mutationProtectionRaw.Type
>

const orderedTaxonomyRaw = Schema.Struct({
  id: nonEmpty,
  name: nonEmpty,
  order: Schema.NonNegativeInt,
  description: Schema.optional(nonEmpty),
  color: Schema.optional(hexColorRaw),
  isTerminal: Schema.optional(Schema.Boolean),
})
const simpleTaxonomyRaw = Schema.Struct({
  id: nonEmpty,
  name: nonEmpty,
  order: Schema.NonNegativeInt,
  description: Schema.optional(nonEmpty),
  color: Schema.optional(hexColorRaw),
})
const connectorCapabilityRaw = Schema.Literal(
  'comments',
  'atomicVoting',
  'webhooks',
)
const connectorConfigRaw = Schema.Struct({
  id: nonEmpty,
  displayName: nonEmpty,
  capabilities: Schema.Array(connectorCapabilityRaw),
  setup: Schema.optional(Schema.Unknown),
})

const feedbaxConfigRaw = Schema.Struct({
  publicUrl: Schema.optional(httpUrl),
  branding: brandingRaw,
  subscriptions: Schema.optionalWith(
    Schema.Struct({ enabled: Schema.Boolean }),
    { default: () => ({ enabled: false }) },
  ),
  commentRoles: Schema.optionalWith(
    Schema.Struct({
      administrator: Schema.optionalWith(Schema.Array(nonEmpty), {
        default: () => [],
      }),
      team: Schema.optionalWith(Schema.Array(nonEmpty), { default: () => [] }),
    }),
    { default: () => ({ administrator: [], team: [] }) },
  ),
  publicTaxonomy: Schema.optional(
    Schema.Struct({
      statuses: Schema.Array(orderedTaxonomyRaw),
      categories: Schema.Array(simpleTaxonomyRaw),
      tags: Schema.optionalWith(Schema.Array(simpleTaxonomyRaw), {
        default: () => [],
      }),
    }),
  ),
  roadmap: Schema.optional(
    Schema.Struct({
      title: nonEmpty,
      description: Schema.optional(nonEmpty),
      columnStatusIds: Schema.Array(nonEmpty).pipe(Schema.minItems(1)),
    }),
  ),
  changelog: Schema.optional(
    Schema.Struct({ title: nonEmpty, description: Schema.optional(nonEmpty) }),
  ),
  authentication: Schema.optional(Schema.Unknown),
  mutationProtection: Schema.optional(mutationProtectionRaw),
  connector: connectorConfigRaw,
}).pipe(
  Schema.filter(
    (config) => {
      const statuses = config.publicTaxonomy?.statuses ?? []
      return new Set(statuses.map(({ id }) => id)).size === statuses.length
    },
    { message: () => 'Public status IDs must be unique' },
  ),
  Schema.filter(
    (config) => {
      if (!config.roadmap) return true
      const columns = config.roadmap.columnStatusIds
      if (new Set(columns).size !== columns.length) return false
      const known = new Set(
        config.publicTaxonomy?.statuses.map(({ id }) => id) ?? [],
      )
      return columns.every((id) => known.has(id))
    },
    { message: () => 'Roadmap columns must be unique known public statuses' },
  ),
)
export const FeedbaxConfigSchema = runtimeSchema(feedbaxConfigRaw)

type DecodedConfig = typeof feedbaxConfigRaw.Type
export type FeedbaxConfig = typeof feedbaxConfigRaw.Encoded & {
  readonly authentication?: SignedHandoffConfig
  readonly connector: ConnectorDescriptor & {
    readonly setup?: NotionSetupConfig
  }
}
export type ResolvedFeedbaxConfig = DeepMutable<
  Omit<DecodedConfig, 'authentication' | 'connector'>
> & {
  readonly authentication?: SignedHandoffConfig
  readonly connector: ConnectorDescriptor & {
    readonly setup?: NotionSetupConfig
  }
}
export type BrandingConfig = ResolvedFeedbaxConfig['branding']
export type BrandTheme = typeof brandThemeRaw.Type

export const defineConfig = (config: FeedbaxConfig): ResolvedFeedbaxConfig =>
  FeedbaxConfigSchema.parse(config) as unknown as ResolvedFeedbaxConfig
