import type { ConnectorDescriptor } from '@feedbax/core'
import type { SignedHandoffConfig } from '@feedbax/auth'
import type { NotionSetupConfig } from '@feedbax/notion'
import { z } from 'zod'

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
export interface FeedbaxConfig {
  readonly name: string
  readonly publicUrl?: string
  readonly socialPreviewImage?: string
  readonly subscriptions?: { readonly enabled: boolean }
  readonly commentRoles?: {
    readonly administrator?: readonly string[]
    readonly team?: readonly string[]
  }
  readonly branding?: {
    readonly tagline?: string
    readonly mark?: string
    readonly logoUrl?: string
    readonly accent?: string
    readonly supportUrl?: string
  }
  readonly publicTaxonomy?: {
    readonly statuses: readonly {
      readonly id: string
      readonly name: string
      readonly order: number
      readonly description?: string
      readonly color?: string
      readonly isTerminal?: boolean
    }[]
    readonly categories: readonly {
      readonly id: string
      readonly name: string
      readonly order: number
    }[]
    readonly tags?: readonly {
      readonly id: string
      readonly name: string
      readonly order: number
    }[]
  }
  readonly roadmap?: {
    readonly title: string
    readonly description?: string
    readonly columnStatusIds: readonly string[]
  }
  readonly changelog?: {
    readonly title: string
    readonly description?: string
  }
  readonly authentication?: SignedHandoffConfig
  readonly mutationProtection?: MutationProtectionConfig
  readonly connector:
    | ConnectorDescriptor
    | (ConnectorDescriptor & {
        readonly id: 'notion'
        readonly setup: NotionSetupConfig
      })
}
export const defineConfig = (config: FeedbaxConfig): FeedbaxConfig => {
  if (config.mutationProtection)
    MutationProtectionConfigSchema.parse(config.mutationProtection)
  const statuses = config.publicTaxonomy?.statuses ?? []
  if (new Set(statuses.map(({ id }) => id)).size !== statuses.length)
    throw new Error('Public status IDs must be unique.')
  if (config.roadmap) {
    const columns = config.roadmap.columnStatusIds
    if (!config.roadmap.title.trim() || columns.length === 0)
      throw new Error('Roadmap title and at least one column are required.')
    if (new Set(columns).size !== columns.length)
      throw new Error('Roadmap columns must be unique.')
    const known = new Set(statuses.map(({ id }) => id))
    if (columns.some((id) => !known.has(id)))
      throw new Error('Every roadmap column must reference a public status.')
  }
  if (config.changelog && !config.changelog.title.trim())
    throw new Error('Changelog title is required.')
  return config
}
