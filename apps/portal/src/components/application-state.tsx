import type { ReactNode } from 'react'

export type ApplicationStateKind =
  | 'loading'
  | 'empty'
  | 'search-empty'
  | 'authentication'
  | 'connector'
  | 'rate-limited'
  | 'permission'
  | 'unexpected'
  | 'not-found'

export function ApplicationState({
  kind,
  title,
  children,
  actions,
  requestId,
  scope = 'page',
}: {
  kind: ApplicationStateKind
  title: string
  children: ReactNode
  actions?: ReactNode
  requestId?: string
  scope?: 'page' | 'section' | 'action'
}) {
  const alert = [
    'connector',
    'rate-limited',
    'permission',
    'unexpected',
  ].includes(kind)
  const Heading = scope === 'page' ? 'h1' : 'h3'
  return (
    <section
      className={`application-state state-${kind}`}
      data-scope={scope}
      role={alert ? 'alert' : kind === 'loading' ? 'status' : undefined}
      aria-live={kind === 'loading' ? 'polite' : undefined}
      aria-busy={kind === 'loading' ? true : undefined}
    >
      {kind === 'loading' ? (
        <span className="loader" aria-hidden="true" />
      ) : null}
      {alert ? (
        <span className="outage-mark" aria-hidden="true">
          !
        </span>
      ) : null}
      <p className="eyebrow">{eyebrow[kind]}</p>
      <Heading>{title}</Heading>
      <div className="state-description">{children}</div>
      {requestId ? (
        <p className="request-reference">
          Reference: <code>{requestId}</code>
        </p>
      ) : null}
      {actions ? <div className="state-actions">{actions}</div> : null}
      {kind === 'loading' ? (
        <div className="skeleton-lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </section>
  )
}

const eyebrow: Record<ApplicationStateKind, string> = {
  loading: 'Loading',
  empty: 'No feedback yet',
  'search-empty': 'No matching feedback',
  authentication: 'Sign in required',
  connector: 'Connection interrupted',
  'rate-limited': 'Please slow down',
  permission: 'Access denied',
  unexpected: 'Something went wrong',
  'not-found': 'Not found',
}

export function RefreshStatus({ active }: { active: boolean }) {
  return (
    <p className="refresh-status" role="status" aria-live="polite">
      {active ? 'Refreshing…' : ''}
    </p>
  )
}
