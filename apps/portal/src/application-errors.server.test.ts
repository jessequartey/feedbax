import { describe, expect, it } from 'vitest'
import {
  applicationErrorResponse,
  classifyApplicationError,
  type RequestLogEvent,
} from './application-errors.server.js'

describe('public application errors', () => {
  it('maps rate limits and permission failures', () => {
    expect(
      classifyApplicationError({ code: 'rate-limited', retryAfterSeconds: 12 }),
    ).toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
      retryAfterSeconds: 12,
    })
    expect(classifyApplicationError({ code: 'authorization' })).toMatchObject({
      code: 'PERMISSION_DENIED',
      status: 403,
      retryable: false,
    })
  })

  it('returns sanitized errors and logs request context without request secrets', async () => {
    let event: RequestLogEvent | undefined
    const request = new Request('https://board.test/api/feedback?q=private', {
      headers: {
        authorization: 'Bearer PRIVATE_TOKEN',
        cookie: 'session=PRIVATE_COOKIE',
        'x-request-id': 'request-123',
      },
    })
    const response = await applicationErrorResponse(
      request,
      'list-feedback',
      new Error('Notion could not load public data.'),
      undefined,
      {
        log: (value) => {
          event = value
        },
      },
    )
    expect(response.headers.get('x-request-id')).toBe('request-123')
    expect(await response.json()).toEqual({
      error: {
        code: 'CONNECTOR_UNAVAILABLE',
        message: 'The connected workspace is temporarily unavailable.',
        requestId: 'request-123',
        retryable: true,
      },
    })
    expect(event).toMatchObject({
      requestId: 'request-123',
      route: '/api/feedback',
      method: 'GET',
      operation: 'list-feedback',
      connector: 'notion',
      status: 503,
    })
    expect(JSON.stringify(event)).not.toContain('PRIVATE_')
    expect(JSON.stringify(event)).not.toContain('?q=private')
  })

  it('treats logger failures as best effort', async () => {
    const response = await applicationErrorResponse(
      new Request('https://board.test/api/feedback'),
      'list-feedback',
      new Error('safe diagnostic'),
      undefined,
      {
        log: () => {
          throw new Error('private logger failure')
        },
      },
    )
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('logger failure')
  })
})
