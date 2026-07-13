import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import config from '../../feedbax.config.mjs'
import { validateLocalBrandAssets } from './brand-assets.js'

validateLocalBrandAssets(
  config.branding,
  new URL('./public', import.meta.url).pathname,
)

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
  ],
})
