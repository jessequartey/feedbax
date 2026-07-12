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
  return config
}
