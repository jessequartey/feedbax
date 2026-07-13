import { createFileRoute } from '@tanstack/react-router'
import { publicError } from '../spike.js'
import { applicationErrorResponse } from '../application-errors.server.js'
export const Route = createFileRoute('/api/error')({
  server: {
    handlers: {
      GET: async ({ request }) => {
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
          return applicationErrorResponse(request, 'error-test', error, {
            code: 'UNEXPECTED_ERROR',
            message: 'An unexpected error occurred.',
            status: 500,
            retryable: true,
          })
        }
      },
    },
  },
})
