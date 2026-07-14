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
          return (
            !value.startsWith('//') &&
            !value.includes('..') &&
            !value.includes('\\')
          )
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
        if (
          value.startsWith('/') &&
          !value.startsWith('//') &&
          !value.includes('\\')
        )
          return true
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
const base64urlSecret = nonEmpty.pipe(
  Schema.filter(
    (value) =>
      /^[A-Za-z0-9_-]+$/.test(value) &&
      Math.floor((value.length * 3) / 4) >= 32,
    { message: () => 'Signing secrets must contain 32 base64url bytes' },
  ),
)
const signingKeyRaw = Schema.Struct({ id: nonEmpty, secret: base64urlSecret })
const signedHandoffConfigRaw = Schema.Struct({
  audience: nonEmpty,
  issuers: Schema.Array(
    Schema.Struct({
      issuer: httpsUrl,
      keys: Schema.Array(signingKeyRaw).pipe(Schema.minItems(1)),
    }),
  ).pipe(Schema.minItems(1)),
  sessionKeys: Schema.Array(signingKeyRaw).pipe(Schema.minItems(1)),
  activeSessionKeyId: nonEmpty,
  loginUrl: httpUrl,
  handoffPath: Schema.optional(
    nonEmpty.pipe(
      Schema.filter(
        (value) =>
          value.startsWith('/') &&
          !value.startsWith('//') &&
          !value.includes('\\'),
        { message: () => 'Expected a safe root-relative handoff path' },
      ),
    ),
  ),
  sessionLifetimeSeconds: Schema.optional(positiveInt),
  maximumHandoffLifetimeSeconds: Schema.optional(positiveInt),
  clockToleranceSeconds: Schema.optional(Schema.NonNegativeInt),
  consumeReplayKey: Schema.optional(
    Schema.Unknown.pipe(
      Schema.filter((value) => typeof value === 'function', {
        message: () => 'consumeReplayKey must be a function',
      }),
    ),
  ),
}).pipe(
  Schema.filter(
    (config) =>
      config.sessionKeys.some(({ id }) => id === config.activeSessionKeyId),
    { message: () => 'activeSessionKeyId must reference a session key' },
  ),
  Schema.filter(
    (config) =>
      new Set(config.sessionKeys.map(({ id }) => id)).size ===
        config.sessionKeys.length &&
      new Set(config.issuers.map(({ issuer }) => issuer)).size ===
        config.issuers.length &&
      config.issuers.every(
        ({ keys }) => new Set(keys.map(({ id }) => id)).size === keys.length,
      ),
    { message: () => 'Handoff issuer and key identifiers must be unique' },
  ),
)
const notionPropertyTypeRaw = Schema.Literal(
  'title',
  'rich_text',
  'number',
  'select',
  'multi_select',
  'status',
  'date',
  'people',
  'files',
  'checkbox',
  'url',
  'email',
  'phone_number',
  'formula',
  'relation',
  'rollup',
  'created_time',
  'created_by',
  'last_edited_time',
  'last_edited_by',
)
const notionFieldRaw = Schema.Struct({
  property: nonEmpty,
  type: notionPropertyTypeRaw,
  writable: Schema.Boolean,
})
const notionFieldOf = <const Types extends readonly [string, ...string[]]>(
  ...types: Types
) =>
  Schema.Struct({
    property: nonEmpty,
    type: Schema.Literal(...types),
    writable: Schema.Boolean,
  })
const stringRecord = Schema.Record({ key: Schema.String, value: nonEmpty })
const notionSetupRaw = Schema.Struct({
  dataSourceId: nonEmpty,
  fields: Schema.Struct({
    title: notionFieldRaw,
    description: notionFieldRaw,
    feedbackType: notionFieldOf('select'),
    status: notionFieldOf('status', 'select'),
    commentCount: notionFieldOf('number'),
    optional: Schema.optional(
      Schema.Record({ key: Schema.String, value: notionFieldRaw }),
    ),
  }),
  statuses: Schema.Record({
    key: Schema.String,
    value: Schema.Union(
      nonEmpty,
      Schema.Array(nonEmpty).pipe(Schema.minItems(1)),
    ),
  }),
  statusDefinitions: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Struct({
        name: nonEmpty,
        description: Schema.optional(nonEmpty),
        color: Schema.optional(nonEmpty),
        order: Schema.NonNegativeInt,
        isTerminal: Schema.optional(Schema.Boolean),
      }),
    }),
  ),
  categories: Schema.optional(stringRecord),
  feedbackTypes: Schema.optional(stringRecord),
  tags: Schema.optional(stringRecord),
  votes: Schema.optional(
    Schema.Struct({
      dataSourceId: nonEmpty,
      fields: Schema.Struct({
        key: notionFieldOf('title'),
        feedbackItem: notionFieldOf('relation'),
        voterKey: notionFieldOf('rich_text'),
        active: notionFieldOf('checkbox'),
      }),
    }),
  ),
  comments: Schema.optional(
    Schema.Struct({
      dataSourceId: nonEmpty,
      fields: Schema.Struct({
        key: notionFieldOf('title'),
        feedbackItem: notionFieldOf('relation'),
        body: notionFieldOf('rich_text'),
        authorId: notionFieldOf('rich_text'),
        authorName: notionFieldOf('rich_text'),
        authorAvatar: Schema.optional(notionFieldOf('url')),
        authorKind: notionFieldOf('select'),
      }),
    }),
  ),
  changelog: Schema.optional(
    Schema.Struct({
      dataSourceId: nonEmpty,
      fields: Schema.Struct({
        title: notionFieldOf('title'),
        description: notionFieldOf('rich_text'),
        slug: notionFieldOf('rich_text'),
        publishedAt: notionFieldOf('date'),
        published: notionFieldOf('checkbox'),
        version: Schema.optional(notionFieldOf('rich_text')),
        tags: Schema.optional(notionFieldOf('multi_select')),
        coverImageUrl: Schema.optional(notionFieldOf('url')),
        linkedFeedbackItemIds: Schema.optional(notionFieldOf('relation')),
      }),
    }),
  ),
})
const connectorConfigRaw = Schema.Struct({
  id: nonEmpty,
  displayName: nonEmpty,
  capabilities: Schema.Array(connectorCapabilityRaw),
  setup: Schema.optional(notionSetupRaw),
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
  authentication: Schema.optional(signedHandoffConfigRaw),
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
