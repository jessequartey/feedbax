import type { SignedHandoffConfig } from '@feedbax/auth'
import {
  ConnectorCapabilitySchema,
  type ConnectorDescriptor,
} from '@feedbax/core'
import type { NotionSetupConfig } from '@feedbax/notion'
import { z } from 'zod'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const LOCAL_ASSET_EXTENSIONS = {
  logo: new Set(['.svg', '.png', '.webp', '.jpg', '.jpeg']),
  favicon: new Set(['.svg', '.png', '.ico']),
  socialPreviewImage: new Set(['.png', '.jpg', '.jpeg', '.webp']),
} as const

export type BrandAssetKind = keyof typeof LOCAL_ASSET_EXTENSIONS

const HttpUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol
  return protocol === 'https:' || protocol === 'http:'
}, 'Expected an HTTP(S) URL')
const HttpsUrlSchema = z
  .url()
  .refine(
    (value) => new URL(value).protocol === 'https:',
    'Expected an HTTPS URL',
  )

export const HexColorSchema = z
  .string()
  .regex(HEX_COLOR, 'Expected a six-digit hex color such as #2563eb')
  .transform((value) => value.toLowerCase() as `#${string}`)

function assetExtension(value: string) {
  const pathname = value.startsWith('/') ? value : new URL(value).pathname
  const index = pathname.lastIndexOf('.')
  return index === -1 ? '' : pathname.slice(index).toLowerCase()
}

export function brandAssetSchema(kind: BrandAssetKind) {
  return z
    .string()
    .trim()
    .min(1)
    .superRefine((value, context) => {
      if (!value.startsWith('/')) {
        try {
          if (new URL(value).protocol !== 'https:')
            throw new Error('unsupported protocol')
        } catch {
          context.addIssue({
            code: 'custom',
            message: 'Expected a root-relative path or HTTPS URL',
          })
          return
        }
      } else if (value.startsWith('//') || value.includes('..')) {
        context.addIssue({
          code: 'custom',
          message: 'Local assets must be root-relative and cannot contain ".."',
        })
        return
      }
      if (!LOCAL_ASSET_EXTENSIONS[kind].has(assetExtension(value)))
        context.addIssue({
          code: 'custom',
          message: `Unsupported ${kind} file type`,
        })
    })
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

export const BrandThemeSchema = z.strictObject({
  background: HexColorSchema,
  surface: HexColorSchema,
  text: HexColorSchema,
  mutedText: HexColorSchema,
  border: HexColorSchema,
})

const NavigationLinkSchema = z.strictObject({
  label: z.string().trim().min(1, 'Navigation labels cannot be empty'),
  href: z
    .string()
    .trim()
    .min(1)
    .superRefine((value, context) => {
      if (value.startsWith('/') && !value.startsWith('//')) return
      try {
        if (new URL(value).protocol === 'https:') return
      } catch {
        // Report the shared message below.
      }
      context.addIssue({
        code: 'custom',
        message: 'Navigation destinations must be root-relative or HTTPS URLs',
      })
    }),
})

const BrandingSchema = z
  .strictObject({
    productName: z.string().trim().min(1),
    description: z.string().trim().min(1),
    logo: brandAssetSchema('logo'),
    favicon: brandAssetSchema('favicon'),
    socialPreviewImage: brandAssetSchema('socialPreviewImage').optional(),
    accentColor: HexColorSchema,
    themes: z.strictObject({
      light: BrandThemeSchema,
      dark: BrandThemeSchema,
    }),
    navigation: z.array(NavigationLinkSchema).min(1).readonly(),
    supportUrl: z
      .union([HttpsUrlSchema, z.string().regex(/^mailto:[^\s@]+@[^\s@]+$/)])
      .optional(),
    poweredByFeedbax: z.boolean(),
  })
  .superRefine((branding, context) => {
    const destinations = branding.navigation.map(({ href }) => href)
    if (new Set(destinations).size !== destinations.length)
      context.addIssue({
        code: 'custom',
        path: ['navigation'],
        message: 'Navigation destinations must be unique',
      })

    for (const mode of ['light', 'dark'] as const) {
      const theme = branding.themes[mode]
      for (const [foreground, background, label] of [
        [theme.text, theme.background, 'text on background'],
        [theme.text, theme.surface, 'text on surface'],
        [theme.mutedText, theme.background, 'muted text on background'],
        [theme.mutedText, theme.surface, 'muted text on surface'],
      ] as const)
        if (contrastRatio(foreground, background) < 4.5)
          context.addIssue({
            code: 'custom',
            path: ['themes', mode],
            message: `${label} must meet a 4.5:1 contrast ratio`,
          })

      for (const background of [theme.background, theme.surface])
        if (contrastRatio(branding.accentColor, background) < 3)
          context.addIssue({
            code: 'custom',
            path: ['accentColor'],
            message: `Accent color must meet a 3:1 contrast ratio against the ${mode} theme`,
          })
    }
  })

export const MutationActionProtectionSchema = z.strictObject({
  limit: z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
  captcha: z.boolean().optional(),
})

const AllowedOriginSchema = z.string().superRefine((value, context) => {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.origin !== value
    )
      context.addIssue({
        code: 'custom',
        message: 'Expected an exact HTTP origin',
      })
  } catch {
    context.addIssue({ code: 'custom', message: 'Expected a valid origin' })
  }
})

export const MutationProtectionConfigSchema = z.strictObject({
  allowedOrigins: z.array(AllowedOriginSchema).readonly().optional(),
  maximumBodyBytes: z.number().int().positive().max(1_000_000).optional(),
  request: MutationActionProtectionSchema,
  actions: z.strictObject({
    submit: MutationActionProtectionSchema,
    vote: MutationActionProtectionSchema,
    comment: MutationActionProtectionSchema,
    subscribe: MutationActionProtectionSchema,
  }),
})
export type MutationProtectionConfig = z.infer<
  typeof MutationProtectionConfigSchema
>

const OrderedTaxonomySchema = z.strictObject({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  order: z.number().int().nonnegative(),
  description: z.string().trim().min(1).optional(),
  color: HexColorSchema.optional(),
  isTerminal: z.boolean().optional(),
})

const ConnectorConfigSchema = z.object({
  id: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  capabilities: z.array(ConnectorCapabilitySchema).readonly(),
  setup: z.custom<NotionSetupConfig>().optional(),
})

export const FeedbaxConfigSchema = z
  .strictObject({
    publicUrl: HttpUrlSchema.optional(),
    branding: BrandingSchema,
    subscriptions: z
      .strictObject({ enabled: z.boolean() })
      .default({ enabled: false }),
    commentRoles: z
      .strictObject({
        administrator: z.array(z.string().trim().min(1)).readonly().default([]),
        team: z.array(z.string().trim().min(1)).readonly().default([]),
      })
      .default({ administrator: [], team: [] }),
    publicTaxonomy: z
      .strictObject({
        statuses: z.array(OrderedTaxonomySchema).readonly(),
        categories: z
          .array(OrderedTaxonomySchema.omit({ isTerminal: true }))
          .readonly(),
        tags: z
          .array(OrderedTaxonomySchema.omit({ isTerminal: true }))
          .readonly()
          .default([]),
      })
      .optional(),
    roadmap: z
      .strictObject({
        title: z.string().trim().min(1),
        description: z.string().trim().min(1).optional(),
        columnStatusIds: z.array(z.string().trim().min(1)).min(1).readonly(),
      })
      .optional(),
    changelog: z
      .strictObject({
        title: z.string().trim().min(1),
        description: z.string().trim().min(1).optional(),
      })
      .optional(),
    authentication: z.custom<SignedHandoffConfig>().optional(),
    mutationProtection: MutationProtectionConfigSchema.optional(),
    connector: ConnectorConfigSchema,
  })
  .superRefine((config, context) => {
    const statuses = config.publicTaxonomy?.statuses ?? []
    if (new Set(statuses.map(({ id }) => id)).size !== statuses.length)
      context.addIssue({
        code: 'custom',
        path: ['publicTaxonomy', 'statuses'],
        message: 'Public status IDs must be unique',
      })
    if (config.roadmap) {
      const columns = config.roadmap.columnStatusIds
      if (new Set(columns).size !== columns.length)
        context.addIssue({
          code: 'custom',
          path: ['roadmap', 'columnStatusIds'],
          message: 'Roadmap columns must be unique',
        })
      const known = new Set(statuses.map(({ id }) => id))
      if (columns.some((id: string) => !known.has(id)))
        context.addIssue({
          code: 'custom',
          path: ['roadmap', 'columnStatusIds'],
          message: 'Every roadmap column must reference a public status',
        })
    }
  })

export type FeedbaxConfig = z.input<typeof FeedbaxConfigSchema> & {
  readonly connector: ConnectorDescriptor & {
    readonly setup?: NotionSetupConfig
  }
}
export type ResolvedFeedbaxConfig = z.output<typeof FeedbaxConfigSchema>
export type BrandingConfig = ResolvedFeedbaxConfig['branding']
export type BrandTheme = z.infer<typeof BrandThemeSchema>

export const defineConfig = (config: FeedbaxConfig): ResolvedFeedbaxConfig =>
  FeedbaxConfigSchema.parse(config)
