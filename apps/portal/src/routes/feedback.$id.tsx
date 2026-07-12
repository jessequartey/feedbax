import { createFileRoute, notFound } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import type { PublicFeedbackDetail } from '@feedbax/core'
import { getFeedbackDetail } from '../server.functions.js'
import { ConnectorOutage, PortalLoading, PortalShell } from '../components/portal-shell.js'
import { portalBranding, portalPublicConfig } from '../portal.config.js'
import { renderSanitizedMarkdown } from '../markdown.js'

export function metadataFor(detail: PublicFeedbackDetail) {
  const title = `${detail.item.title} · ${portalBranding.name}`
  const description = detail.item.description.replace(/\s+/g, ' ').trim().slice(0, 160)
  const canonical = `${portalPublicConfig.publicUrl}/feedback/${encodeURIComponent(detail.item.id)}`
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:type', content: 'article' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: portalPublicConfig.socialPreviewImage },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: portalPublicConfig.socialPreviewImage },
    ],
    links: [{ rel: 'canonical', href: canonical }],
  }
}

export const Route = createFileRoute('/feedback/$id')({
  loader: async ({ params }) => {
    const detail = await getFeedbackDetail({ data: params.id })
    if (!detail) throw notFound()
    return detail
  },
  head: ({ loaderData }) => loaderData ? metadataFor(loaderData) : ({
    meta: [{ name: 'robots', content: 'noindex' }],
  }),
  pendingComponent: PortalLoading,
  errorComponent: ({ reset }) => <ConnectorOutage onRetry={reset} />,
  notFoundComponent: FeedbackNotFound,
  component: FeedbackDetailPage,
})

const formatDate = (value: string) => new Intl.DateTimeFormat('en', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
}).format(new Date(value))

async function mutate(path: string, input: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-feedbax-return-path': location.pathname },
    body: JSON.stringify({ input }),
  })
  const body = await response.json() as { error?: { message?: string; loginLocation?: string } }
  if (!response.ok) {
    if (response.status === 401 && body.error?.loginLocation) location.assign(body.error.loginLocation)
    throw new Error(body.error?.message ?? 'This action is temporarily unavailable.')
  }
}

function FeedbackDetailPage() {
  const detail = Route.useLoaderData()
  const { item } = detail
  const [votes, setVotes] = useState(item.voteCount)
  const [voted, setVoted] = useState(item.hasViewerVoted ?? false)
  const [subscribed, setSubscribed] = useState(detail.subscription.isSubscribed ?? false)
  const [pending, setPending] = useState<'vote' | 'comment' | 'subscribe' | null>(null)
  const [message, setMessage] = useState('')

  const vote = async () => {
    const next = !voted
    setPending('vote'); setMessage('')
    try {
      await mutate('/api/vote', { feedbackItemId: item.id, voted: next })
      setVoted(next); setVotes((value) => Math.max(0, value + (next ? 1 : -1)))
    } catch (error) { setMessage((error as Error).message) } finally { setPending(null) }
  }
  const subscribe = async () => {
    const next = !subscribed
    setPending('subscribe'); setMessage('')
    try {
      await mutate('/api/subscribe', { feedbackItemId: item.id, subscribed: next })
      setSubscribed(next); setMessage(next ? 'You’re subscribed to updates.' : 'Subscription removed.')
    } catch (error) { setMessage((error as Error).message) } finally { setPending(null) }
  }
  const comment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = new FormData(form).get('body')?.toString().trim()
    if (!body) return
    setPending('comment'); setMessage('')
    try {
      await mutate('/api/comment', { feedbackItemId: item.id, body })
      form.reset(); setMessage('Comment posted. Refresh to see the latest discussion.')
    } catch (error) { setMessage((error as Error).message) } finally { setPending(null) }
  }

  return <PortalShell branding={portalBranding} activePage="feedback">
    <a className="back-link" href="/">← All feedback</a>
    <div className="detail-layout">
      <article className="feedback-detail">
        <header className="detail-heading">
          <div><p className="eyebrow">{item.type}</p><h1>{item.title}</h1></div>
          <button className="vote detail-vote" type="button" aria-pressed={voted} disabled={pending === 'vote'} onClick={() => void vote()} aria-label={`${voted ? 'Remove vote from' : 'Vote for'} ${item.title}; ${votes} votes`}><span aria-hidden="true">↑</span><strong>{votes}</strong></button>
        </header>
        <div className="markdown detail-description" dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(item.description) }} />
        <div className="detail-byline">
          {item.author.avatarUrl ? <img src={item.author.avatarUrl} alt="" /> : <span aria-hidden="true">{item.author.displayName.slice(0, 1).toUpperCase()}</span>}
          <p>Shared by <strong>{item.author.displayName}</strong><small>Created <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>{item.updatedAt !== item.createdAt ? <> · Updated <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></> : null}</small></p>
        </div>
        <section className="detail-section" aria-labelledby="comments-title">
          <div className="section-heading"><h2 id="comments-title">Comments</h2><span>{detail.comments.items.length}</span></div>
          {detail.comments.items.length ? <div className="comment-list">{detail.comments.items.map((comment) => <article key={comment.id} className="comment"><div><strong>{comment.author.displayName}</strong><time dateTime={comment.createdAt}>{formatDate(comment.createdAt)}</time></div><div className="markdown" dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(comment.body) }} /></article>)}</div> : <p className="empty-copy">No comments yet. Start the conversation.</p>}
          <form className="comment-form" onSubmit={(event) => void comment(event)}><label htmlFor="comment-body">Add a comment</label><textarea id="comment-body" name="body" rows={4} maxLength={10000} required /><button className="primary-button" disabled={pending === 'comment'}>{pending === 'comment' ? 'Posting…' : 'Post comment'}</button></form>
        </section>
      </article>
      <aside className="detail-context" aria-label="Feedback details">
        <dl><div><dt>Status</dt><dd>{item.status?.name ?? 'No status'}</dd></div><div><dt>Type</dt><dd>{item.type}</dd></div>{item.category ? <div><dt>Category</dt><dd>{item.category.name}</dd></div> : null}<div><dt>Votes</dt><dd>{votes}</dd></div></dl>
        {item.tags.length ? <div className="detail-tags">{item.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</div> : null}
        {detail.subscription.enabled ? <button className="secondary-button subscribe-button" type="button" aria-pressed={subscribed} disabled={pending === 'subscribe'} onClick={() => void subscribe()}>{subscribed ? 'Subscribed' : 'Subscribe to updates'}</button> : null}
        {detail.roadmap.length || detail.changelog.length ? <section className="related"><h2>Related activity</h2>{detail.roadmap.map((entry) => <a href="/roadmap" key={entry.id}><small>Roadmap{entry.status ? ` · ${entry.status.name}` : ''}</small><strong>{entry.title}</strong></a>)}{detail.changelog.map((entry) => <a href="/changelog" key={entry.id}><small>Changelog{entry.version ? ` · ${entry.version}` : ''}</small><strong>{entry.title}</strong></a>)}</section> : null}
        <p className="action-message" aria-live="polite">{message}</p>
      </aside>
    </div>
  </PortalShell>
}

function FeedbackNotFound() {
  return <PortalShell branding={portalBranding} activePage="feedback"><section className="state-page"><p className="eyebrow">Not found</p><h1>This feedback isn’t available</h1><p>It may have been removed, made private, or the link may be incorrect.</p><div className="state-actions"><a className="primary-button" href="/">Browse feedback</a></div></section></PortalShell>
}
