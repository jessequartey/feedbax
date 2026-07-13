import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { CreateCommentInputSchema, PublicCommentSchema, SetVoteResultSchema, VoteStateResponseSchema, type PublicComment, type PublicFeedbackDetail } from '@feedbax/core'
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

async function mutate(path: string, input: unknown): Promise<unknown> {
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
  return (body as { ok?: boolean; value?: unknown }).value
}

function FeedbackDetailPage() {
  const detail = Route.useLoaderData()
  const { item } = detail
  const [votes, setVotes] = useState(item.voteCount)
  const [voted, setVoted] = useState(item.hasViewerVoted ?? false)
  const [subscribed, setSubscribed] = useState(detail.subscription.isSubscribed ?? false)
  const [pending, setPending] = useState<'vote' | 'comment' | 'subscribe' | null>(null)
  const [message, setMessage] = useState('')
  type CommentRow = { comment: PublicComment; clientRequestId?: string; state?: 'pending' | 'failed'; error?: string }
  const [comments, setComments] = useState<CommentRow[]>(() => detail.comments.items.map((comment) => ({ comment })))
  useEffect(() => {
    void fetch('/api/vote-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ feedbackItemIds: [item.id] }) })
      .then(async (response) => response.ok ? response.json() : null)
      .then((value) => { if (value) setVoted(VoteStateResponseSchema.parse(value).items[0]?.voted ?? false) })
      .catch(() => undefined)
  }, [item.id])

  const vote = async () => {
    const next = !voted
    const previous = { voted, votes }
    setPending('vote'); setMessage('')
    setVoted(next); setVotes(Math.max(0, votes + (next ? 1 : -1)))
    try {
      const result = SetVoteResultSchema.parse(await mutate('/api/vote', { feedbackItemId: item.id, voted: next }))
      setVoted(result.voted); setVotes(result.voteCount)
    } catch (error) { setVoted(previous.voted); setVotes(previous.votes); setMessage((error as Error).message) } finally { setPending(null) }
  }
  const subscribe = async () => {
    const next = !subscribed
    setPending('subscribe'); setMessage('')
    try {
      await mutate('/api/subscribe', { feedbackItemId: item.id, subscribed: next })
      setSubscribed(next); setMessage(next ? 'You’re subscribed to updates.' : 'Subscription removed.')
    } catch (error) { setMessage((error as Error).message) } finally { setPending(null) }
  }
  const persistComment = async (clientRequestId: string, body: string, temporaryId: string) => {
    setComments((current) => current.map((row) => row.comment.id !== temporaryId ? row : { comment: row.comment, ...(row.clientRequestId ? { clientRequestId: row.clientRequestId } : {}), state: 'pending' }))
    try {
      const saved = PublicCommentSchema.parse(await mutate('/api/comment', { clientRequestId, feedbackItemId: item.id, body }))
      setComments((current) => current.map((row) => row.comment.id === temporaryId ? { comment: saved } : row))
      setMessage('Comment posted.')
    } catch (error) {
      setComments((current) => current.map((row) => row.comment.id === temporaryId ? { ...row, state: 'failed', error: (error as Error).message } : row))
      setMessage('Your comment could not be posted. You can retry it below.')
    }
  }
  const comment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = new FormData(form).get('body')?.toString().trim()
    if (!body) return
    const clientRequestId = crypto.randomUUID()
    const parsed = CreateCommentInputSchema.safeParse({ clientRequestId, feedbackItemId: item.id, body })
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? 'The comment is invalid.'); return }
    const now = new Date().toISOString()
    const temporaryId = `pending-${clientRequestId}`
    const temporary = PublicCommentSchema.parse({ id: temporaryId, feedbackItemId: item.id, body, author: { id: 'viewer', displayName: 'You' }, authorKind: 'customer', createdAt: now, updatedAt: now })
    setComments((current) => [...current, { comment: temporary, clientRequestId, state: 'pending' }])
    form.reset(); setMessage('Posting comment…')
    await persistComment(clientRequestId, body, temporaryId)
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
          <div className="section-heading"><h2 id="comments-title">Comments</h2><span>{comments.length}</span></div>
          {comments.length ? <div className="comment-list">{comments.map((row) => { const comment = row.comment; return <article key={comment.id} className="comment" data-state={row.state}><div><span><strong>{comment.author.displayName}</strong>{comment.authorKind !== 'customer' ? <small className="author-badge">{comment.authorKind === 'administrator' ? 'Administrator' : 'Team'}</small> : null}</span><time dateTime={comment.createdAt}>{row.state === 'pending' ? 'Posting…' : formatDate(comment.createdAt)}</time></div><div className="markdown" dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(comment.body) }} />{row.state === 'failed' ? <div className="comment-retry" role="alert"><span>{row.error ?? 'Comment failed.'}</span><button type="button" onClick={() => void persistComment(row.clientRequestId!, comment.body, comment.id)}>Retry</button><button type="button" onClick={() => setComments((current) => current.filter((candidate) => candidate.comment.id !== comment.id))}>Discard</button></div> : null}</article> })}</div> : <p className="empty-copy">No comments yet. Start the conversation.</p>}
          <form className="comment-form" onSubmit={(event) => void comment(event)}><label htmlFor="comment-body">Add a comment</label><textarea id="comment-body" name="body" rows={4} maxLength={10000} required aria-describedby="comment-help" /><small id="comment-help">Markdown is supported. For privacy, don’t include email addresses.</small><button className="primary-button">Post comment</button></form>
        </section>
      </article>
      <aside className="detail-context" aria-label="Feedback details">
        <dl><div><dt>Status</dt><dd>{item.status?.name ?? 'No status'}</dd></div><div><dt>Type</dt><dd>{item.type}</dd></div>{item.category ? <div><dt>Category</dt><dd>{item.category.name}</dd></div> : null}<div><dt>Votes</dt><dd>{votes}</dd></div></dl>
        {item.tags.length ? <div className="detail-tags">{item.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</div> : null}
        {detail.subscription.enabled ? <button className="secondary-button subscribe-button" type="button" aria-pressed={subscribed} disabled={pending === 'subscribe'} onClick={() => void subscribe()}>{subscribed ? 'Subscribed' : 'Subscribe to updates'}</button> : null}
        {detail.roadmap.length || detail.changelog.length ? <section className="related"><h2>Related activity</h2>{detail.roadmap.map((entry) => <a href="/roadmap" key={entry.id}><small>Roadmap{entry.status ? ` · ${entry.status.name}` : ''}</small><strong>{entry.title}</strong></a>)}{detail.changelog.map((entry) => <a href={`/changelog/${encodeURIComponent(entry.slug)}`} key={entry.id}><small>Shipped{entry.version ? ` · ${entry.version}` : ''}</small><strong>{entry.title}</strong></a>)}</section> : null}
        <p className="action-message" aria-live="polite">{message}</p>
      </aside>
    </div>
  </PortalShell>
}

function FeedbackNotFound() {
  return <PortalShell branding={portalBranding} activePage="feedback"><section className="state-page"><p className="eyebrow">Not found</p><h1>This feedback isn’t available</h1><p>It may have been removed, made private, or the link may be incorrect.</p><div className="state-actions"><a className="primary-button" href="/">Browse feedback</a></div></section></PortalShell>
}
