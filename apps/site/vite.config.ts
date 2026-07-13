import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import mdx from 'fumadocs-mdx/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import * as MdxConfig from './source.config'

export default defineConfig({
  plugins: [
    mdx(MdxConfig),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          enabled: true,
          crawlLinks: true,
        },
      },
    }),
    nitro(),
    viteReact(),
  ],
  ssr: { noExternal: ['fumadocs-core', 'fumadocs-ui'] },
})
