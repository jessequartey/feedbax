import type {
  PublicChangelogDetail,
} from '@feedbax/core'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { formatReleaseDate } from '../components/changelog-feed.js'
import { ConnectorOutage, PortalLoading, PortalShell } from '../components/portal-shell.js'
import { plainTextFromMarkdown, renderSanitizedMarkdown } from '../markdown.js'
import { portalBranding, portalPublicConfig } from '../portal.config.js'
import { getChangelogDetail } from '../server.functions.js'

export function changelogMetadata(detail: PublicChangelogDetail) {
  const { entry } = detail
  const title = `${entry.title} · ${portalBranding.name}`
  const description = plainTextFromMarkdown(entry.description).slice(0, 160)
  const canonical = `${portalPublicConfig.publicUrl}/changelog/${encodeURIComponent(entry.slug)}`
  const image = entry.coverImageUrl ?? portalPublicConfig.socialPreviewImage
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:type', content: 'article' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: image },
      { property: 'article:published_time', content: entry.publishedAt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
    ],
    links: [{ rel: 'canonical', href: canonical }],
  }
}

export const Route = createFileRoute('/changelog_/$slug')({
  loader: async ({ params }) => {
    const detail = await getChangelogDetail({ data: params.slug })
    if (!detail) throw notFound()
    return detail
  },
  head: ({ loaderData }) => loaderData
    ? changelogMetadata(loaderData)
    : { meta: [{ name: 'robots', content: 'noindex' }] },
  pendingComponent: () => <PortalLoading activePage="changelog" />,
  errorComponent: ({ reset }) => <ConnectorOutage onRetry={reset} activePage="changelog" />,
  notFoundComponent: ChangelogNotFound,
  component: ChangelogDetailPage,
})

function ChangelogDetailPage() {
  const { entry, relatedFeedback } = Route.useLoaderData()
  return (
    <PortalShell branding={portalBranding} activePage="changelog">
      <a className="back-link" href="/changelog">← All updates</a>
      <article className="changelog-detail">
        <header>
          <div className="changelog-detail-meta">
            <time dateTime={entry.publishedAt}>{formatReleaseDate(entry.publishedAt)}</time>
            {entry.version ? <strong>{entry.version}</strong> : null}
          </div>
          <h1>{entry.title}</h1>
          {entry.tags.length ? <ul aria-label="Tags">{entry.tags.map((tag) => <li key={tag.id}>{tag.name}</li>)}</ul> : null}
        </header>
        {entry.coverImageUrl ? <img className="changelog-detail-cover" src={entry.coverImageUrl} alt="" width="1200" height="675" /> : null}
        <div className="markdown changelog-detail-content" dangerouslySetInnerHTML={{ __html: renderSanitizedMarkdown(entry.description) }} />
        {relatedFeedback.length ? (
          <section className="shipped-feedback" aria-labelledby="shipped-feedback-heading">
            <p className="eyebrow">Closed loop</p>
            <h2 id="shipped-feedback-heading">Shipped with this update</h2>
            <div>
              {relatedFeedback.map((item) => (
                <a href={`/feedback/${encodeURIComponent(item.id)}`} key={item.id} aria-label={`${item.status!.name}: ${item.title}`}>
                  <span>{item.status!.name}</span>
                  <strong>{item.title}</strong>
                  <small>{item.category?.name ?? item.type}</small>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </PortalShell>
  )
}

function ChangelogNotFound() {
  return (
    <PortalShell branding={portalBranding} activePage="changelog">
      <section className="state-page">
        <p className="eyebrow">Not found</p>
        <h1>This update isn’t available</h1>
        <p>It may be unpublished, removed, or the link may be incorrect.</p>
        <div className="state-actions"><a className="primary-button" href="/changelog">Browse updates</a></div>
      </section>
    </PortalShell>
  )
}
