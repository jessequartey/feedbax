import { createFileRoute } from '@tanstack/react-router'
import { CACHE_ETAG, cachePayload, json } from '../spike.js'
export const Route = createFileRoute('/api/cache')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const headers = {
          'cache-control':
            'public, max-age=60, s-maxage=300, stale-while-revalidate=60',
          etag: CACHE_ETAG,
        }
        return request.headers.get('if-none-match') === CACHE_ETAG
          ? new Response(null, { status: 304, headers })
          : json(cachePayload(), { headers })
      },
    },
  },
})
