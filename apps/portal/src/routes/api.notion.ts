import { createFileRoute } from '@tanstack/react-router'
import { fetchNotion, json, publicError } from '../spike.js'
export const Route = createFileRoute('/api/notion')({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await fetchNotion(), {
            headers: { 'cache-control': 'no-store' },
          })
        } catch (error) {
          console.error(
            'Notion spike request failed',
            error instanceof Error ? error.message : 'unknown',
          )
          return publicError(
            502,
            'NOTION_UNAVAILABLE',
            'The Notion connectivity check failed.',
          )
        }
      },
    },
  },
})
