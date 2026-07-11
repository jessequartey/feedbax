import { createFileRoute } from '@tanstack/react-router'
import { publicError } from '../spike.js'
export const Route = createFileRoute('/api/error')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const expected =
          new URL(request.url).searchParams.get('kind') === 'expected'
        if (expected)
          return publicError(
            400,
            'EXPECTED_SPIKE_ERROR',
            'The requested test error occurred.',
          )
        try {
          throw new Error('SPIKE_INTERNAL_SENTINEL')
        } catch (error) {
          console.error(
            'Unexpected spike error',
            error instanceof Error ? error.message : 'unknown',
          )
          return publicError(
            500,
            'INTERNAL_ERROR',
            'An unexpected error occurred.',
          )
        }
      },
    },
  },
})
