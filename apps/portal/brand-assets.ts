import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BrandingConfig } from '@feedbax/config'

export function validateLocalBrandAssets(
  branding: BrandingConfig,
  publicDirectory: string,
) {
  for (const [field, value] of [
    ['logo', branding.logo],
    ['favicon', branding.favicon],
    ['socialPreviewImage', branding.socialPreviewImage],
  ] as const) {
    if (!value?.startsWith('/')) continue
    const path = resolve(publicDirectory, value.slice(1))
    if (!existsSync(path))
      throw new Error(
        `Invalid branding.${field}: local asset ${JSON.stringify(value)} was not found at ${path}.`,
      )
  }
}
