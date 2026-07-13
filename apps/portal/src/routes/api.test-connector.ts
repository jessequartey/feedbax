import { createFileRoute } from '@tanstack/react-router'
import {
  resetMockConnector,
  setMockConnectorFailure,
} from '../mock-connector.server.js'
import { json, publicError, readEnv } from '../spike.js'

export const Route = createFileRoute('/api/test-connector')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (
          readEnv('FEEDBAX_E2E') !== 'true' ||
          request.headers.get('x-feedbax-test-key') !==
            readEnv('FEEDBAX_E2E_KEY')
        )
          return publicError(404, 'NOT_FOUND', 'This route is not available.')
        const body = (await request.json()) as { action?: unknown }
        if (body.action === 'reset') resetMockConnector()
        else if (body.action === 'fail') setMockConnectorFailure(true)
        else if (body.action === 'recover') setMockConnectorFailure(false)
        else return publicError(400, 'INVALID_REQUEST', 'Unknown test action.')
        return json({ ok: true })
      },
    },
  },
})
