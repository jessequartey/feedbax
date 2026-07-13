import type { ChangelogEntry } from '@feedbax/core'
import type { CSSProperties } from 'react'
import { useChangelogCollection } from '../collections/index.js'
import { renderSanitizedMarkdown } from '../markdown.js'
import { publicChangelog } from '../portal.config.js'
import { ErrorState } from './error-state.js'
import { RefreshStatus } from './application-state.js'

const dateFormatter = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export const formatReleaseDate = (value: string) =>
  dateFormatter.format(new Date(value))

function preview(markdown: string) {
  const value =
    markdown.length > 460 ? `${markdown.slice(0, 460).trimEnd()}…` : markdown
  return renderSanitizedMarkdown(value)
}

function ChangelogPreview({
  entry,
  index,
}: {
  entry: ChangelogEntry
  index: number
}) {
  const href = `/changelog/${encodeURIComponent(entry.slug)}`
  return (
    <article
      className="changelog-entry"
      style={{ '--entry-index': index } as CSSProperties}
    >
      <aside className="changelog-entry-meta" aria-label="Release details">
        <time dateTime={entry.publishedAt}>
          {formatReleaseDate(entry.publishedAt)}
        </time>
        {entry.version ? <strong>{entry.version}</strong> : null}
        {entry.tags.length ? (
          <ul aria-label="Tags">
            {entry.tags.map((tag) => (
              <li key={tag.id}>{tag.name}</li>
            ))}
          </ul>
        ) : null}
      </aside>
      <div className="changelog-entry-body">
        {entry.coverImageUrl ? (
          <a
            className="changelog-cover"
            href={href}
            tabIndex={-1}
            aria-hidden="true"
          >
            <img
              src={entry.coverImageUrl}
              alt=""
              width="1200"
              height="675"
              loading="lazy"
            />
          </a>
        ) : null}
        <p className="changelog-entry-kicker">Product update</p>
        <h2>
          <a href={href}>{entry.title}</a>
        </h2>
        <div
          className="markdown changelog-preview"
          dangerouslySetInnerHTML={{ __html: preview(entry.description) }}
        />
        <footer>
          <a href={href}>
            Continue reading <span aria-hidden="true">→</span>
          </a>
        </footer>
      </div>
    </article>
  )
}

export function ChangelogFeed() {
  const {
    items,
    hasMore,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    loadMore,
    refetch,
  } = useChangelogCollection()

  return (
    <section className="changelog-page" aria-labelledby="changelog-heading">
      <header className="changelog-heading">
        <p className="eyebrow">Release notes</p>
        <h1 id="changelog-heading">{publicChangelog.title}</h1>
        <p>{publicChangelog.description}</p>
      </header>
      <RefreshStatus active={isRefreshing} />
      {isLoading ? (
        <div
          className="changelog-feed changelog-skeleton"
          aria-live="polite"
          aria-busy="true"
        >
          <span />
          <span />
          <span />
        </div>
      ) : items.length ? (
        <div className="changelog-feed">
          {items.map((entry, index) => (
            <ChangelogPreview key={entry.id} entry={entry} index={index} />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="changelog-empty">
          <span aria-hidden="true">↗</span>
          <h2>No updates published yet.</h2>
          <p>Shipped features and improvements will appear here.</p>
        </div>
      )}
      {items.length > 0 && error ? (
        <ErrorState
          error={error}
          onRetry={() => void refetch()}
          scope="action"
        />
      ) : null}
      {hasMore ? (
        <div className="changelog-load-more">
          <button type="button" disabled={isLoadingMore} onClick={loadMore}>
            {isLoadingMore ? 'Loading updates…' : 'Load more updates'}
          </button>
        </div>
      ) : null}
    </section>
  )
}
