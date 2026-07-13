import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { portalBranding } from './src/portal.config.js'
import { validateLocalBrandAssets } from './brand-assets.js'

let directory: string | undefined
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true })
  directory = undefined
})

describe('brand asset validation', () => {
  it('accepts configured local assets only when the files exist', () => {
    directory = mkdtempSync(join(tmpdir(), 'feedbax-brand-'))
    mkdirSync(join(directory, 'brand'))
    writeFileSync(join(directory, 'brand/logo.svg'), '<svg/>')
    writeFileSync(join(directory, 'favicon.svg'), '<svg/>')
    expect(() =>
      validateLocalBrandAssets(
        {
          ...portalBranding,
          socialPreviewImage: 'https://images.example/preview.png',
        },
        directory!,
      ),
    ).not.toThrow()
    rmSync(join(directory, 'favicon.svg'))
    expect(() => validateLocalBrandAssets(portalBranding, directory!)).toThrow(
      /branding\.favicon.*not found/,
    )
  })
})
