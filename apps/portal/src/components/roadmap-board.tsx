import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  ApplicationApiError,
  setRoadmapVote,
  useRoadmapCollection,
} from '../collections/index.js'
import { publicRoadmap, publicTaxonomy } from '../portal.config.js'

const configuredIds: string[] = [...publicRoadmap.columnStatusIds]
const statusById = new Map<string, (typeof publicTaxonomy.statuses)[number]>(
  publicTaxonomy.statuses.map((status) => [status.id, status]),
)

function readStatuses() {
  if (typeof location === 'undefined') return configuredIds
  const values = [
    ...new Set(new URLSearchParams(location.search).getAll('status')),
  ].filter((id) => configuredIds.includes(id as never))
  return values.length
    ? configuredIds.filter((id) => values.includes(id))
    : configuredIds
}

export function RoadmapBoard() {
  const [statuses, setStatuses] = useState<string[]>(readStatuses)
  const [votingIds, setVotingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [voteMessage, setVoteMessage] = useState('')
  const { items, hasMore, isLoading, isLoadingMore, error, loadMore, refetch } =
    useRoadmapCollection(statuses)

  useEffect(() => {
    const onPopState = () => setStatuses(readStatuses())
    addEventListener('popstate', onPopState)
    return () => removeEventListener('popstate', onPopState)
  }, [])

  const grouped = useMemo(() => {
    const value = new Map(
      statuses.map((id) => [id, []] as [string, (typeof items)[number][]]),
    )
    for (const item of items)
      if (item.status && value.has(item.status.id))
        value.get(item.status.id)!.push(item)
    return value
  }, [items, statuses])

  const commit = (next: string[]) => {
    if (!next.length) return
    const ordered = configuredIds.filter((id) => next.includes(id))
    const params = new URLSearchParams()
    if (ordered.length !== configuredIds.length)
      for (const id of ordered) params.append('status', id)
    history.pushState(
      null,
      '',
      `${location.pathname}${params.size ? `?${params}` : ''}`,
    )
    setStatuses(ordered)
  }

  const vote = async (id: string, voted: boolean) => {
    if (votingIds.has(id)) return
    setVotingIds((current) => new Set(current).add(id))
    setVoteMessage('')
    try {
      await setRoadmapVote(statuses, id, voted)
    } catch (cause) {
      if (
        cause instanceof ApplicationApiError &&
        cause.status === 401 &&
        cause.loginLocation
      ) {
        location.assign(cause.loginLocation)
        return
      }
      setVoteMessage(
        cause instanceof Error
          ? cause.message
          : 'Your vote could not be saved.',
      )
    } finally {
      setVotingIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <section className="roadmap-page" aria-labelledby="roadmap-heading">
      <header className="roadmap-heading">
        <div>
          <h1 id="roadmap-heading">{publicRoadmap.title}</h1>
          <p>{publicRoadmap.description}</p>
        </div>
        <details className="roadmap-filter">
          <summary aria-label="Filter roadmap statuses">
            <span aria-hidden="true">⌁</span>
            {statuses.length === configuredIds.length
              ? 'All statuses'
              : `${statuses.length} statuses`}
          </summary>
          <fieldset>
            <legend>Show statuses</legend>
            {configuredIds.map((id) => {
              const status = statusById.get(id)!
              const checked = statuses.includes(id)
              return (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked && statuses.length === 1}
                    onChange={() =>
                      commit(
                        checked
                          ? statuses.filter((value) => value !== id)
                          : [...statuses, id],
                      )
                    }
                  />
                  <span
                    className="roadmap-filter-dot"
                    style={{ '--status-color': status.color } as CSSProperties}
                  />
                  {status.name}
                </label>
              )
            })}
            <button type="button" onClick={() => commit(configuredIds)}>
              Show all
            </button>
          </fieldset>
        </details>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {voteMessage ||
          (isLoading
            ? 'Loading roadmap'
            : `${items.length} roadmap items loaded`)}
      </p>
      {error ? (
        <div className="roadmap-outage" role="alert">
          <strong>The roadmap is temporarily unavailable.</strong>
          <p>{error.message}</p>
          <button type="button" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <RoadmapSkeleton count={statuses.length} />
      ) : (
        <div
          className="roadmap-columns"
          style={{ '--roadmap-columns': statuses.length } as CSSProperties}
        >
          {statuses.map((id, columnIndex) => {
            const status = statusById.get(id)!
            const columnItems = grouped.get(id) ?? []
            return (
              <section
                className="roadmap-column"
                key={id}
                style={
                  {
                    '--status-color': status.color,
                    '--column-index': columnIndex,
                  } as CSSProperties
                }
                aria-labelledby={`roadmap-${id}`}
              >
                <header>
                  <h2 id={`roadmap-${id}`}>
                    <span aria-hidden="true" />
                    {status.name}
                  </h2>
                  <span>{columnItems.length}</span>
                </header>
                <div className="roadmap-cards">
                  {columnItems.length ? (
                    columnItems.map((item, itemIndex) => (
                      <article
                        className="roadmap-card"
                        key={item.id}
                        style={{ '--item-index': itemIndex } as CSSProperties}
                      >
                        <a href={`/feedback/${item.id}`}>
                          <h3>{item.title}</h3>
                          <p>{item.description}</p>
                        </a>
                        <footer>
                          <span>{item.category?.name ?? 'Feedback'}</span>
                          <span aria-label={`${item.commentCount} comments`}>
                            ◌ {item.commentCount}
                          </span>
                          <button
                            type="button"
                            aria-pressed={item.hasViewerVoted ?? false}
                            disabled={votingIds.has(item.id)}
                            onClick={() =>
                              void vote(
                                item.id,
                                !(item.hasViewerVoted ?? false),
                              )
                            }
                            aria-label={`Vote for ${item.title}; ${item.voteCount} votes`}
                          >
                            <span aria-hidden="true">⌃</span>
                            {item.voteCount}
                          </button>
                        </footer>
                      </article>
                    ))
                  ) : (
                    <div className="roadmap-column-empty">
                      <p>No feedback here yet.</p>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {hasMore && !isLoading && !error ? (
        <div className="roadmap-load-more">
          <button
            className="secondary-button"
            type="button"
            disabled={isLoadingMore}
            onClick={loadMore}
          >
            {isLoadingMore ? 'Loading…' : 'Load more feedback'}
          </button>
        </div>
      ) : null}
    </section>
  )
}

function RoadmapSkeleton({ count }: { count: number }) {
  return (
    <div
      className="roadmap-columns roadmap-skeleton"
      style={{ '--roadmap-columns': count } as CSSProperties}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, column) => (
        <section className="roadmap-column" key={column}>
          <header />
          <div className="roadmap-cards">
            {Array.from({ length: 3 }, (_, item) => (
              <span key={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
