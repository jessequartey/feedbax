import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { portalBranding, publicTaxonomy } from '../portal.config.js'
import { setFeedbackVote, useFeedbackCollection } from '../collections/index.js'
import { ApplicationState, RefreshStatus } from './application-state.js'
import { ErrorState } from './error-state.js'
import { FeedbackForm } from './feedback-form.js'

type Sort = 'popular' | 'recent' | 'updated'
type Filters = { q: string; statuses: string[]; category: string; sort: Sort }

function readFilters(): Filters {
  if (typeof location === 'undefined')
    return { q: '', statuses: [], category: '', sort: 'popular' }
  const params = new URLSearchParams(location.search)
  const value = params.get('sort')
  return {
    q: params.get('q') ?? '',
    statuses: params.getAll('status'),
    category: params.get('category') ?? '',
    sort: value === 'recent' || value === 'updated' ? value : 'popular',
  }
}

function filterParams(filters: Filters) {
  const params = new URLSearchParams()
  if (filters.q.trim()) params.set('q', filters.q.trim())
  for (const status of filters.statuses) params.append('status', status)
  if (filters.category) params.set('category', filters.category)
  if (filters.sort !== 'popular') params.set('sort', filters.sort)
  return params
}

export function FeedbackBoard() {
  const [filters, setFilters] = useState<Filters>(() => readFilters())
  const [searchDraft, setSearchDraft] = useState(filters.q)
  const [formSignal, setFormSignal] = useState(0)
  const formOpener = useRef<HTMLElement | null>(null)
  const [votingIds, setVotingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [voteMessage, setVoteMessage] = useState('')
  const [voteError, setVoteError] = useState<Error>()
  const collection = useFeedbackCollection(filters)
  const {
    items,
    hasMore,
    isLoading,
    isLoadingMore,
    isRefreshing,
    error,
    loadMore,
    refetch,
  } = collection
  useEffect(() => {
    const initial = readFilters()
    setFilters(initial)
    setSearchDraft(initial.q)
    const onPopState = () => {
      const next = readFilters()
      setFilters(next)
      setSearchDraft(next.q)
    }
    addEventListener('popstate', onPopState)
    return () => removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    if (searchDraft === filters.q) return
    const timeout = setTimeout(() => {
      const next = { ...filters, q: searchDraft }
      history.replaceState(
        null,
        '',
        `${location.pathname}?${filterParams(next)}`,
      )
      setFilters(next)
    }, 350)
    return () => clearTimeout(timeout)
  }, [searchDraft, filters])

  const commit = (next: Filters) => {
    history.pushState(null, '', `${location.pathname}?${filterParams(next)}`)
    setFilters(next)
  }
  const toggleStatus = (id: string) =>
    commit({
      ...filters,
      statuses: filters.statuses.includes(id)
        ? filters.statuses.filter((value) => value !== id)
        : [...filters.statuses, id],
    })
  const filtered = Boolean(
    filters.q || filters.statuses.length || filters.category,
  )
  const openForm = (event: MouseEvent<HTMLElement>) => {
    formOpener.current = event.currentTarget
    setFormSignal((value) => value + 1)
  }
  const vote = async (id: string, voted: boolean) => {
    if (votingIds.has(id)) return
    setVotingIds((current) => new Set(current).add(id))
    setVoteMessage('')
    setVoteError(undefined)
    try {
      await setFeedbackVote(filters, id, voted)
    } catch (error) {
      const failure =
        error instanceof Error
          ? error
          : new Error('Your vote could not be saved.')
      setVoteError(failure)
      setVoteMessage(failure.message)
    } finally {
      setVotingIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <>
      <section className="page-intro">
        <div>
          <h1>Share Your Product Feedback</h1>
          <p>
            Tell us what would make {portalBranding.productName} work better for
            you.
          </p>
        </div>
      </section>
      <section className="board" aria-labelledby="feedback-heading">
        <div className="board-heading">
          <h2 id="feedback-heading">Feedback</h2>
          <button className="primary-button" type="button" onClick={openForm}>
            <span aria-hidden="true">＋</span> Create Feedback
          </button>
        </div>
        <div className="filters">
          <label className="filter-search">
            <span>Search</span>
            <input
              name="feedback-search"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search ideas…"
              autoComplete="off"
            />
          </label>
          <fieldset>
            <legend>Status</legend>
            <div className="status-options">
              {publicTaxonomy.statuses.map((status) => (
                <label key={status.id}>
                  <input
                    type="checkbox"
                    checked={filters.statuses.includes(status.id)}
                    onChange={() => toggleStatus(status.id)}
                  />{' '}
                  <span>{status.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            <span>Category</span>
            <select
              value={filters.category}
              onChange={(event) =>
                commit({ ...filters, category: event.target.value })
              }
            >
              <option value="">All categories</option>
              {publicTaxonomy.categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select
              value={filters.sort}
              onChange={(event) =>
                commit({ ...filters, sort: event.target.value as Sort })
              }
            >
              <option value="popular">Trending</option>
              <option value="recent">New</option>
              <option value="updated">Recently updated</option>
            </select>
          </label>
        </div>
        <p className="result-status" role="status" aria-live="polite">
          {isLoading
            ? 'Loading feedback…'
            : isLoadingMore
              ? 'Loading more feedback…'
              : `${items.length} ${items.length === 1 ? 'result' : 'results'} loaded`}
        </p>
        <RefreshStatus active={isRefreshing} />
        {isLoading ? (
          <div className="board-loading" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : items.length > 0 ? (
          <div className="request-list">
            {items.map((item) => (
              <article className="request" key={item.id}>
                <button
                  className="vote"
                  type="button"
                  aria-pressed={item.hasViewerVoted ?? false}
                  disabled={votingIds.has(item.id)}
                  onClick={() =>
                    void vote(item.id, !(item.hasViewerVoted ?? false))
                  }
                  aria-label={`Vote for ${item.title}; ${item.voteCount} votes`}
                >
                  <span aria-hidden="true">↑</span>
                  <strong>{item.voteCount}</strong>
                </button>
                <a className="request-copy" href={`/feedback/${item.id}`}>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  {item.status && (
                    <span className="status">{item.status.name}</span>
                  )}
                  {item.category && (
                    <span className="category">{item.category.name}</span>
                  )}
                  <span className="comments">{item.commentCount} comments</span>
                </a>
              </article>
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <Empty
            filtered={filtered}
            onCreate={(element) => {
              formOpener.current = element
              setFormSignal((value) => value + 1)
            }}
            onClear={() =>
              commit({ q: '', statuses: [], category: '', sort: filters.sort })
            }
          />
        )}
        {items.length > 0 && error ? (
          <ErrorState
            error={error}
            onRetry={() => void refetch()}
            scope="action"
          />
        ) : null}
        {voteError ? <ErrorState error={voteError} scope="action" /> : null}
        <p className="sr-only" role="status" aria-live="polite">
          {voteMessage}
        </p>
        {hasMore && !isLoading && (
          <div className="load-more">
            <button
              className="secondary-button"
              disabled={isLoadingMore}
              type="button"
              onClick={loadMore}
            >
              {isLoadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </section>
      <FeedbackForm
        filters={filters}
        openSignal={formSignal}
        opener={formOpener.current}
      />
    </>
  )
}

function Empty({
  filtered,
  onCreate,
  onClear,
}: {
  filtered: boolean
  onCreate: (element: HTMLElement) => void
  onClear: () => void
}) {
  return (
    <ApplicationState
      kind={filtered ? 'search-empty' : 'empty'}
      scope="section"
      title={filtered ? 'No feedback matches your search' : 'No feedback yet'}
      actions={
        <button
          className="primary-button"
          type="button"
          onClick={(event) =>
            filtered ? onClear() : onCreate(event.currentTarget)
          }
        >
          {filtered ? 'Clear Filters' : 'Create Feedback'}
        </button>
      }
    >
      <p>
        {filtered
          ? 'Try a broader search or remove one of the active filters.'
          : 'Be the first to share an idea with the team.'}
      </p>
    </ApplicationState>
  )
}
