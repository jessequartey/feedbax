import {
  contrastRatio,
  readableAccentForeground,
  type ResolvedFeedbaxConfig,
} from '@feedbax/config'
import rawConfig from '../../../feedbax.config.mjs'

const config: ResolvedFeedbaxConfig = rawConfig

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined)
    throw new Error(
      `Invalid Feedbax configuration: ${field} is required by the portal.`,
    )
  return value
}

export const portalBranding = {
  ...config.branding,
  accentForeground: readableAccentForeground(config.branding.accentColor),
  accentText: {
    light:
      Math.min(
        contrastRatio(
          config.branding.accentColor,
          config.branding.themes.light.background,
        ),
        contrastRatio(
          config.branding.accentColor,
          config.branding.themes.light.surface,
        ),
      ) >= 4.5
        ? config.branding.accentColor
        : config.branding.themes.light.text,
    dark:
      Math.min(
        contrastRatio(
          config.branding.accentColor,
          config.branding.themes.dark.background,
        ),
        contrastRatio(
          config.branding.accentColor,
          config.branding.themes.dark.surface,
        ),
      ) >= 4.5
        ? config.branding.accentColor
        : config.branding.themes.dark.text,
  },
}

export const portalPublicConfig = {
  publicUrl: config.publicUrl ?? 'http://localhost:3000',
  subscriptions: config.subscriptions,
  commentRoles: config.commentRoles,
} as const

export const publicTaxonomy = required(config.publicTaxonomy, 'publicTaxonomy')
export const publicRoadmap = required(config.roadmap, 'roadmap')
export const publicChangelog = required(config.changelog, 'changelog')
export const notionStatusMappings = config.connector.setup?.statuses ?? {}
