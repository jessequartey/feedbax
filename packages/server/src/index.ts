import { Cause, Effect, Exit, ManagedRuntime, Schema } from 'effect'
import { FeedbackRepository, hasCapability } from '@feedbax/connector-sdk'
import {
  CapabilityUnavailable,
  ConnectorUnavailable,
  InternalError,
  NotFound,
  PageQuery,
  PublicError,
  SubmitFeedbackInput,
  type PublicError as PublicErrorType,
} from '@feedbax/contracts'
import type { FeedbackItemId } from '@feedbax/domain'

export const listFeedback = (input: unknown) =>
  Effect.gen(function* () {
    const query = yield* Schema.decodeUnknown(PageQuery)(input).pipe(
      Effect.mapError(
        () =>
          new ConnectorUnavailable({
            message: 'The feedback query is invalid.',
            retryable: false,
          }),
      ),
    )
    const repository = yield* FeedbackRepository
    if (
      query.search &&
      !hasCapability(repository.descriptor, 'feedback.search')
    ) {
      return yield* new CapabilityUnavailable({
        capability: 'feedback.search',
        message: 'Search is not supported by the configured connector.',
      })
    }
    return yield* repository.list(query)
  })

export const getFeedback = (id: FeedbackItemId) =>
  Effect.gen(function* () {
    const repository = yield* FeedbackRepository
    const item = yield* repository.get(id)
    if (!item)
      return yield* new NotFound({ message: 'Feedback was not found.' })
    return item
  })

export const submitFeedback = (input: unknown) =>
  Effect.gen(function* () {
    const data = yield* Schema.decodeUnknown(SubmitFeedbackInput)(input).pipe(
      Effect.mapError(
        () =>
          new ConnectorUnavailable({
            message: 'The feedback submission is invalid.',
            retryable: false,
          }),
      ),
    )
    const repository = yield* FeedbackRepository
    if (!hasCapability(repository.descriptor, 'feedback.write')) {
      return yield* new CapabilityUnavailable({
        capability: 'feedback.write',
        message: 'Submissions are disabled by the configured connector.',
      })
    }
    return yield* repository.submit(data)
  })

export interface PublicFailure {
  readonly status: number
  readonly error: PublicErrorType & { readonly requestId?: string }
}
const statusByTag: Readonly<Record<string, number>> = {
  ValidationError: 400,
  IdentityRequired: 401,
  PermissionDenied: 403,
  NotFound: 404,
  Conflict: 409,
  RateLimited: 429,
  CapabilityUnavailable: 422,
  ConnectorUnavailable: 503,
  StorageUnavailable: 503,
  ConfigurationError: 500,
  InternalError: 500,
}

export const publicFailure = (
  error: PublicErrorType,
  requestId: string,
): PublicFailure => ({
  status: statusByTag[error._tag] ?? 500,
  error: { ...error, requestId },
})

export const runAsServerRoute = async <A>(
  runtime: ManagedRuntime.ManagedRuntime<FeedbackRepository, never>,
  requestId: string,
  effect: Effect.Effect<A, PublicErrorType, FeedbackRepository>,
): Promise<Response> => {
  const exit = await runtime.runPromiseExit(effect)
  if (Exit.isSuccess(exit))
    return Response.json({ ok: true, value: exit.value })
  const failure = Cause.failureOption(exit.cause)
  if (failure._tag === 'Some' && Schema.is(PublicError)(failure.value)) {
    const mapped = publicFailure(failure.value, requestId)
    return Response.json(
      { ok: false, error: mapped.error },
      { status: mapped.status },
    )
  }
  const internal = new InternalError({
    message: 'An unexpected error occurred.',
    requestId,
  })
  return Response.json({ ok: false, error: internal }, { status: 500 })
}
