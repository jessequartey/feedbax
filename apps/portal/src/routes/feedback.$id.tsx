import { createFileRoute, notFound } from '@tanstack/react-router'
import { getFeedbackDetail } from '../server.functions.js'
import { PortalShell } from '../components/portal-shell.js'
import { portalBranding } from '../portal.config.js'

export const Route = createFileRoute('/feedback/$id')({
  loader: async ({ params }) => {
    const item = await getFeedbackDetail({ data: params.id })
    if (!item) throw notFound()
    return item
  },
  component: FeedbackDetail,
})

function FeedbackDetail() {
  const item = Route.useLoaderData()
  return <PortalShell branding={portalBranding} activePage="feedback">
    <article className="feedback-detail">
      <a className="back-link" href="/">← Back to feedback</a>
      <div className="detail-heading"><div><span className="status">{item.type[0]!.toUpperCase() + item.type.slice(1)}</span><h1>{item.title}</h1></div><button className="vote detail-vote" type="button" aria-label={`${item.voteCount} votes`}><span aria-hidden="true">↑</span><strong>{item.voteCount}</strong></button></div>
      <p className="detail-description">{item.description}</p>
      <div className="detail-meta">{item.status && <span>{item.status.name}</span>}{item.category && <span>{item.category.name}</span>}{item.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}<span>{item.commentCount} comments</span></div>
    </article>
  </PortalShell>
}
