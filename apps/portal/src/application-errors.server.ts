import type { ApplicationErrorCode } from '@feedbax/core'

type ErrorOptions = {
  code: ApplicationErrorCode
  message: string
  status: number
  retryable: boolean
  retryAfterSeconds?: number
  loginLocation?: string
  connector?: string
}

export type RequestLogEvent = {
  requestId: string
  route: string
  method: string
  operation: string
  connector: string
  code: ApplicationErrorCode
  status: number
  retryable: boolean
  errorName?: string
  diagnosticMessage?: string
}

export interface RequestLogger {
  log(event: RequestLogEvent): void | Promise<void>
}

export const consoleRequestLogger: RequestLogger = {
  log: (event) =>
    console.error(JSON.stringify({ type: 'feedbax.request', ...event })),
}

function requestId(request: Request) {
  const candidate = request.headers.get('x-request-id')
  return candidate && /^[a-zA-Z0-9._-]{1,100}$/.test(candidate)
    ? candidate
    : crypto.randomUUID()
}

export function classifyApplicationError(error: unknown): ErrorOptions {
  const value = error as {
    code?: string
    retryAfterSeconds?: number
    message?: string
  }
  const message = value?.message?.toLowerCase() ?? ''
  if (value?.code === 'rate-limited' || message.includes('rate-limit'))
    return {
      code: 'RATE_LIMITED',
      message:
        'The connected service is receiving too many requests. Please try again shortly.',
      status: 429,
      retryable: true,
      ...(value.retryAfterSeconds
        ? { retryAfterSeconds: value.retryAfterSeconds }
        : {}),
    }
  if (value?.code === 'authorization')
    return {
      code: 'PERMISSION_DENIED',
      message: 'The connected workspace does not allow access to this content.',
      status: 403,
      retryable: false,
    }
  return {
    code: 'CONNECTOR_UNAVAILABLE',
    message: 'The connected workspace is temporarily unavailable.',
    status: 503,
    retryable: true,
  }
}

export async function applicationErrorResponse(
  request: Request,
  operation: string,
  error: unknown,
  options: ErrorOptions = classifyApplicationError(error),
  logger: RequestLogger = consoleRequestLogger,
) {
  const id = requestId(request)
  const cause = error instanceof Error ? error : undefined
  try {
    await logger.log({
      requestId: id,
      route: new URL(request.url).pathname,
      method: request.method,
      operation,
      connector: options.connector ?? 'notion',
      code: options.code,
      status: options.status,
      retryable: options.retryable,
      ...(cause
        ? { errorName: cause.name, diagnosticMessage: cause.message }
        : {}),
    })
  } catch {
    // Observability must never alter the public response.
  }
  const headers = new Headers({
    'cache-control': 'no-store',
    'x-request-id': id,
  })
  if (options.retryAfterSeconds)
    headers.set('retry-after', String(options.retryAfterSeconds))
  return Response.json(
    {
      error: {
        code: options.code,
        message: options.message,
        requestId: id,
        retryable: options.retryable,
        ...(options.retryAfterSeconds
          ? { retryAfterSeconds: options.retryAfterSeconds }
          : {}),
        ...(options.loginLocation
          ? { loginLocation: options.loginLocation }
          : {}),
      },
    },
    { status: options.status, headers },
  )
}
