import { ApplicationApiError } from '../collections/index.js'
import { portalBranding } from '../portal.config.js'
import {
  ApplicationState,
  type ApplicationStateKind,
} from './application-state.js'

function presentation(error: Error) {
  if (!(error instanceof ApplicationApiError))
    return {
      kind: 'unexpected' as const,
      title: 'We couldn’t complete that request',
    }
  const kind: ApplicationStateKind =
    error.code === 'AUTHENTICATION_REQUIRED'
      ? 'authentication'
      : error.code === 'RATE_LIMITED'
        ? 'rate-limited'
        : error.code === 'PERMISSION_DENIED' || error.status === 403
          ? 'permission'
          : error.code === 'NOT_FOUND' || error.status === 404
            ? 'not-found'
            : error.code === 'CONNECTOR_UNAVAILABLE' || error.status === 503
              ? 'connector'
              : 'unexpected'
  const title = {
    authentication: 'Sign in to continue',
    'rate-limited': 'Too many requests',
    permission: 'You don’t have permission to do that',
    'not-found': 'This content isn’t available',
    connector: 'The connected workspace is unavailable',
    unexpected: 'We couldn’t complete that request',
  }[kind as Exclude<typeof kind, 'loading' | 'empty' | 'search-empty'>]
  return { kind, title }
}

export function ErrorState({
  error,
  onRetry,
  scope = 'section',
}: {
  error: Error
  onRetry?: () => void
  scope?: 'page' | 'section' | 'action'
}) {
  const details = presentation(error)
  const apiError = error instanceof ApplicationApiError ? error : undefined
  const signIn = apiError?.loginLocation ? (
    <button
      className="primary-button"
      type="button"
      onClick={() => location.assign(apiError.loginLocation!)}
    >
      Sign In
    </button>
  ) : null
  const retry =
    onRetry && apiError?.retryable !== false ? (
      <button className="primary-button" type="button" onClick={onRetry}>
        Try Again
      </button>
    ) : null
  const support = portalBranding.supportUrl ? (
    <a href={portalBranding.supportUrl}>Contact Support</a>
  ) : null
  const actions = (
    <>
      {details.kind === 'authentication' ? signIn : retry}
      {support}
    </>
  )
  return (
    <ApplicationState
      kind={details.kind}
      title={details.title}
      scope={scope}
      actions={actions}
      {...(details.kind === 'unexpected' && apiError?.requestId
        ? { requestId: apiError.requestId }
        : {})}
    >
      <p>
        {apiError?.message ?? 'An unexpected error occurred. Please try again.'}
      </p>
      {apiError?.retryAfterSeconds ? (
        <p>Try again in about {apiError.retryAfterSeconds} seconds.</p>
      ) : null}
    </ApplicationState>
  )
}
