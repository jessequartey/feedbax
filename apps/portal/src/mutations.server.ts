import {
  safeReturnPath,
  type AuthSession,
  type IdentityProvider,
} from '@feedbax/auth-handoff'
import {
  CreateCommentInputSchema,
  SetVoteInputSchema,
  SubmitFeedbackInputSchema,
  SubscribeInputSchema,
  UnsupportedConnectorOperationError,
  type CreateCommentInput,
  type PublicMutationErrorCode,
  type SetVoteInput,
  type SubmitFeedbackInput,
  type SubscribeInput,
} from '@feedbax/core'
import {
  MutationProtectionConfigSchema,
  type MutationProtectionConfig,
} from '@feedbax/config'
import { authProvider } from './auth.server.js'
import { json } from './spike.js'
import { readEnv } from './spike.js'
import { createNotionMutationService } from '@feedbax/notion'
import { publicCache, publicNotionSetup } from './public-feedback.server.js'
import { portalPublicConfig } from './portal.config.js'
import { mockConnectorRuntime } from './mock-connector.server.js'
import { CloudflareDurableRateLimitStore } from './rate-limit.cloudflare.server.js'

export type MutationAction = 'submit' | 'vote' | 'comment' | 'subscribe'
export interface PublicMutationService {
  submit(session: AuthSession, input: SubmitFeedbackInput): Promise<unknown>
  setVote(session: AuthSession, input: SetVoteInput): Promise<unknown>
  createComment(
    session: AuthSession,
    input: CreateCommentInput,
  ): Promise<unknown>
  setSubscription(session: AuthSession, input: SubscribeInput): Promise<unknown>
}
export interface RateLimitStore {
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>
}
export interface CaptchaProvider {
  verify(token: string, request: Request): Promise<boolean>
}
export interface SecurityEvent {
  requestId: string
  action: MutationAction
  outcome: 'accepted' | 'rejected' | 'failed'
  reason?: PublicMutationErrorCode
  actorKey?: string
  networkKey: string
}
export interface SecurityLogger {
  log(event: SecurityEvent): void | Promise<void>
}
export type { MutationProtectionConfig } from '@feedbax/config'

export function commentAuthorKind(
  role?: string,
): 'customer' | 'team' | 'administrator' {
  if (
    role &&
    portalPublicConfig.commentRoles.administrator.some(
      (value) => value === role,
    )
  )
    return 'administrator'
  if (
    role &&
    portalPublicConfig.commentRoles.team.some((value) => value === role)
  )
    return 'team'
  return 'customer'
}

type Entry = { count: number; resetAt: number }
export class MemoryRateLimitStore implements RateLimitStore {
  private entries = new Map<string, Entry>()
  async consume(key: string, limit: number, windowSeconds: number) {
    const now = Date.now()
    const previous = this.entries.get(key)
    const entry =
      !previous || previous.resetAt <= now
        ? { count: 0, resetAt: now + windowSeconds * 1000 }
        : previous
    entry.count += 1
    this.entries.set(key, entry)
    return {
      allowed: entry.count <= limit,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }
}

export const defaultMutationProtectionConfig: MutationProtectionConfig = {
  maximumBodyBytes: 24_000,
  request: { limit: 120, windowSeconds: 60 },
  actions: {
    submit: { limit: 5, windowSeconds: 300, captcha: true },
    vote: { limit: 60, windowSeconds: 60 },
    comment: { limit: 20, windowSeconds: 300, captcha: true },
    subscribe: { limit: 20, windowSeconds: 300 },
  },
}
const unavailable: PublicMutationService = {
  submit: async () => {
    throw new Error('Mutation persistence is not configured.')
  },
  setVote: async () => {
    throw new Error('Mutation persistence is not configured.')
  },
  createComment: async () => {
    throw new Error('Mutation persistence is not configured.')
  },
  setSubscription: async () => {
    throw new Error('Mutation persistence is not configured.')
  },
}
const consoleLogger: SecurityLogger = {
  log: (event) =>
    console.info(JSON.stringify({ type: 'feedbax.security', ...event })),
}
// Development/single-process fallback. Distributed deployments must inject a
// durable store when constructing their mutation dependencies.
const developmentRateLimits = new MemoryRateLimitStore()

function error(
  status: number,
  code: PublicMutationErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
) {
  const headers = new Headers({ 'cache-control': 'private, no-store' })
  if (typeof extra.retryAfterSeconds === 'number')
    headers.set('retry-after', String(extra.retryAfterSeconds))
  const requestId =
    typeof extra.requestId === 'string' ? extra.requestId : crypto.randomUUID()
  headers.set('x-request-id', requestId)
  return json(
    {
      error: {
        code,
        message,
        requestId,
        retryable: status === 429 || status >= 500,
        ...extra,
      },
    },
    { status, headers },
  )
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(bytes).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
function returnPath(request: Request) {
  return safeReturnPath(request.headers.get('x-feedbax-return-path'))
}
function clientAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

async function safeLog(logger: SecurityLogger, event: SecurityEvent) {
  try {
    await logger.log(event)
  } catch {
    // Security telemetry must never change the public request outcome.
  }
}

export interface MutationDependencies {
  auth: IdentityProvider
  service: PublicMutationService
  rateLimits: RateLimitStore
  logger: SecurityLogger
  captcha?: CaptchaProvider
  config: MutationProtectionConfig
}
export const mutationSchemas = {
  submit: SubmitFeedbackInputSchema,
  vote: SetVoteInputSchema,
  comment: CreateCommentInputSchema,
  subscribe: SubscribeInputSchema,
} as const

interface RuntimeSchema<T> {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: unknown }
}

export async function protectMutation<T>(
  request: Request,
  action: MutationAction,
  schema: RuntimeSchema<T>,
  invoke: (session: AuthSession, input: T) => Promise<unknown>,
  dependencies: MutationDependencies,
): Promise<Response> {
  const requestId = crypto.randomUUID()
  const networkKey = await digest(clientAddress(request))
  const reject = async (
    status: number,
    code: PublicMutationErrorCode,
    message: string,
    extra: Record<string, unknown> = {},
  ) => {
    await safeLog(dependencies.logger, {
      requestId,
      action,
      outcome: 'rejected',
      reason: code,
      networkKey,
    })
    return error(status, code, message, { requestId, ...extra })
  }
  let requestLimited
  try {
    const policy = dependencies.config.request
    requestLimited = await dependencies.rateLimits.consume(
      `request:${networkKey}`,
      policy.limit,
      policy.windowSeconds,
    )
  } catch {
    await safeLog(dependencies.logger, {
      requestId,
      action,
      outcome: 'failed',
      reason: 'MUTATION_UNAVAILABLE',
      networkKey,
    })
    return error(
      503,
      'MUTATION_UNAVAILABLE',
      'This action is temporarily unavailable.',
      { requestId },
    )
  }
  if (!requestLimited.allowed)
    return reject(
      429,
      'RATE_LIMITED',
      'Too many requests. Please try again later.',
      {
        retryAfterSeconds: requestLimited.retryAfterSeconds,
      },
    )
  const origin = request.headers.get('origin')
  const requestOrigin = new URL(request.url).origin
  const allowed = dependencies.config.allowedOrigins ?? [requestOrigin]
  if (!origin || !allowed.includes(origin))
    return reject(403, 'ORIGIN_REJECTED', 'This request origin is not allowed.')
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  )
    return reject(
      415,
      'INVALID_REQUEST',
      'The request must use application/json.',
    )
  const contentLength = request.headers.get('content-length')
  const declaredLength = contentLength === null ? 0 : Number(contentLength)
  const max = dependencies.config.maximumBodyBytes ?? 24_000
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0)
    return reject(400, 'INVALID_REQUEST', 'The content length is invalid.')
  if (declaredLength > max)
    return reject(413, 'INVALID_REQUEST', 'The request body is too large.')
  let session: AuthSession
  try {
    session = await dependencies.auth.requireAuthentication(request)
  } catch {
    let destination = '/'
    try {
      const login = await dependencies.auth.loginRedirect(
        request,
        returnPath(request),
      )
      destination = login.headers.get('location') ?? '/'
    } catch {
      // Authentication configuration details remain private.
    }
    return reject(
      401,
      'AUTHENTICATION_REQUIRED',
      'Verified identity is required for this action.',
      { loginLocation: destination },
    )
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > max)
    return reject(413, 'INVALID_REQUEST', 'The request body is too large.')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return reject(
      400,
      'INVALID_REQUEST',
      'The request body must be valid JSON.',
    )
  }
  const envelope =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const result = schema.safeParse(envelope.input)
  if (
    !result.success ||
    Object.keys(envelope).some(
      (key) => key !== 'input' && key !== 'captchaToken',
    )
  )
    return reject(422, 'INVALID_REQUEST', 'The request fields are invalid.')
  const actorKey = await digest(session.user.id)
  const policy = dependencies.config.actions[action]
  let limited
  try {
    limited = await dependencies.rateLimits.consume(
      `${action}:${actorKey}:${networkKey}`,
      policy.limit,
      policy.windowSeconds,
    )
  } catch {
    await safeLog(dependencies.logger, {
      requestId,
      action,
      outcome: 'failed',
      reason: 'MUTATION_UNAVAILABLE',
      actorKey,
      networkKey,
    })
    return error(
      503,
      'MUTATION_UNAVAILABLE',
      'This action is temporarily unavailable.',
      { requestId },
    )
  }
  if (!limited.allowed)
    return reject(
      429,
      'RATE_LIMITED',
      'Too many requests. Please try again later.',
      { retryAfterSeconds: limited.retryAfterSeconds },
    )
  if (policy.captcha && dependencies.captcha) {
    const token =
      typeof envelope.captchaToken === 'string' ? envelope.captchaToken : ''
    const verified = await (async () => {
      try {
        return !!token && (await dependencies.captcha!.verify(token, request))
      } catch {
        return false
      }
    })()
    if (!verified)
      return reject(
        403,
        'CAPTCHA_REQUIRED',
        'Please complete the verification challenge.',
      )
  }
  try {
    const value = await invoke(session, result.data)
    await safeLog(dependencies.logger, {
      requestId,
      action,
      outcome: 'accepted',
      actorKey,
      networkKey,
    })
    return json(
      { ok: true, value },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (cause) {
    await safeLog(dependencies.logger, {
      requestId,
      action,
      outcome: 'failed',
      reason: 'MUTATION_UNAVAILABLE',
      actorKey,
      networkKey,
    })
    const unsupported = cause instanceof UnsupportedConnectorOperationError
    return error(
      unsupported ? 501 : 503,
      'MUTATION_UNAVAILABLE',
      unsupported
        ? 'The connected service does not support this action.'
        : 'This action is temporarily unavailable.',
      { requestId },
    )
  }
}

export function productionMutationDependencies(
  rateLimits?: RateLimitStore,
  config: MutationProtectionConfig = defaultMutationProtectionConfig,
): MutationDependencies {
  const validated = MutationProtectionConfigSchema.parse(config)
  const auth = authProvider()
  const selectedRateLimits =
    rateLimits ??
    (readEnv('FEEDBAX_RATE_LIMIT_STORE') === 'cloudflare'
      ? new CloudflareDurableRateLimitStore()
      : developmentRateLimits)
  if (readEnv('FEEDBAX_CONNECTOR') === 'mock')
    return {
      auth,
      service: {
        submit: (session, input) =>
          mockConnectorRuntime.mutations.submit(
            input,
            auth.publicUser(session),
          ),
        setVote: (session, input) =>
          mockConnectorRuntime.mutations.setVote(session.user.id, input),
        createComment: (session, input) =>
          mockConnectorRuntime.mutations.createComment(
            auth.publicUser(session),
            commentAuthorKind(session.role),
            input,
          ),
        setSubscription: (session, input) =>
          mockConnectorRuntime.mutations.setSubscription(
            input,
            session.user.id,
          ),
      },
      rateLimits: selectedRateLimits,
      logger: consoleLogger,
      config: validated,
    }
  const token = readEnv('NOTION_TOKEN')
  const interactionHashKey = readEnv('FEEDBAX_INTERACTION_HASH_KEY')
  const notion =
    token && publicNotionSetup.dataSourceId
      ? createNotionMutationService({
          token,
          setup: publicNotionSetup,
          cache: publicCache,
          ...(interactionHashKey ? { interactionHashKey } : {}),
        })
      : null
  return {
    auth,
    service: notion
      ? {
          ...unavailable,
          submit: (session, input) =>
            notion.submit(input, auth.publicUser(session)),
          setVote: (session, input) => notion.setVote(session.user.id, input),
          createComment: (session, input) =>
            notion.createComment(
              auth.publicUser(session),
              commentAuthorKind(session.role),
              input,
            ),
        }
      : unavailable,
    rateLimits: selectedRateLimits,
    logger: consoleLogger,
    config: validated,
  }
}

export function mutationHandler(action: MutationAction) {
  return async ({ request }: { request: Request }) => {
    const deps = productionMutationDependencies()
    const service = deps.service
    switch (action) {
      case 'submit':
        return protectMutation(
          request,
          action,
          mutationSchemas.submit,
          (session, input) => service.submit(session, input),
          deps,
        )
      case 'vote':
        return protectMutation(
          request,
          action,
          mutationSchemas.vote,
          (session, input) => service.setVote(session, input),
          deps,
        )
      case 'comment':
        return protectMutation(
          request,
          action,
          mutationSchemas.comment,
          (session, input) => service.createComment(session, input),
          deps,
        )
      case 'subscribe':
        return protectMutation(
          request,
          action,
          mutationSchemas.subscribe,
          (session, input) => service.setSubscription(session, input),
          deps,
        )
    }
  }
}
