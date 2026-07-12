import type { PublicFeedbackItem, PublicFeedbackPage } from '@feedbax/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { publicTaxonomy } from '../portal.config.js'

type Sort = 'popular' | 'recent' | 'updated'
type Filters = { q: string; statuses: string[]; category: string; sort: Sort }

export function reconcileFeedback(
  current: readonly PublicFeedbackItem[],
  incoming: readonly PublicFeedbackItem[],
) {
  const merged = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) {
    const existing = merged.get(item.id)
    if (!existing || Date.parse(item.updatedAt) > Date.parse(existing.updatedAt)) merged.set(item.id, item)
  }
  return [...merged.values()]
}

function readFilters(): Filters {
  if (typeof location === 'undefined') return { q: '', statuses: [], category: '', sort: 'popular' }
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
  const [items, setItems] = useState<PublicFeedbackItem[]>([])
  const [nextCursor, setNextCursor] = useState<string>()
  const [hasMore, setHasMore] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'more' | 'error' | 'invalid'>('loading')
  const requestKey = useRef('')

  const load = useCallback(async (next: Filters, cursor?: string) => {
    const params = filterParams(next)
    if (cursor) params.set('cursor', cursor)
    const key = filterParams(next).toString()
    requestKey.current = key
    setState(cursor ? 'more' : 'loading')
    if (!cursor) { setItems([]); setHasMore(false); setNextCursor(undefined) }
    try {
      const response = await fetch(`/api/feedback?${params}`)
      if (!response.ok) { setState(response.status === 400 ? 'invalid' : 'error'); return }
      const page = await response.json() as PublicFeedbackPage
      if (requestKey.current !== key) return
      setItems((current) => cursor ? reconcileFeedback(current, page.items) : [...page.items])
      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
      setState('ready')
    } catch { if (requestKey.current === key) setState('error') }
  }, [])

  useEffect(() => { void load(filters) }, [filters, load])
  useEffect(() => {
    const initial = readFilters()
    setFilters(initial)
    setSearchDraft(initial.q)
    const onPopState = () => { const next = readFilters(); setFilters(next); setSearchDraft(next.q) }
    addEventListener('popstate', onPopState)
    return () => removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    if (searchDraft === filters.q) return
    const timeout = setTimeout(() => {
      const next = { ...filters, q: searchDraft }
      history.replaceState(null, '', `${location.pathname}?${filterParams(next)}`)
      setFilters(next)
    }, 350)
    return () => clearTimeout(timeout)
  }, [searchDraft, filters])

  const commit = (next: Filters) => {
    history.pushState(null, '', `${location.pathname}?${filterParams(next)}`)
    setFilters(next)
  }
  const toggleStatus = (id: string) => commit({
    ...filters,
    statuses: filters.statuses.includes(id) ? filters.statuses.filter((value) => value !== id) : [...filters.statuses, id],
  })
  const filtered = Boolean(filters.q || filters.statuses.length || filters.category)

  return <>
    <section className="page-intro">
      <div><h1>Share your product feedback!</h1><p>Tell us what we can do to make {`Feedbax`} work better for you.</p></div>
    </section>
    <section className="board" aria-labelledby="feedback-heading">
      <div className="board-heading"><h2 id="feedback-heading">Feedback</h2><button className="primary-button" type="button"><span aria-hidden="true">＋</span> Create a new post</button></div>
      <div className="filters">
        <label className="filter-search"><span>Search</span><input type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search ideas…" /></label>
        <fieldset><legend>Status</legend><div className="status-options">{publicTaxonomy.statuses.map((status) => <label key={status.id}><input type="checkbox" checked={filters.statuses.includes(status.id)} onChange={() => toggleStatus(status.id)} /> <span>{status.name}</span></label>)}</div></fieldset>
        <label><span>Category</span><select value={filters.category} onChange={(event) => commit({ ...filters, category: event.target.value })}><option value="">All categories</option>{publicTaxonomy.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label><span>Sort by</span><select value={filters.sort} onChange={(event) => commit({ ...filters, sort: event.target.value as Sort })}><option value="popular">Trending</option><option value="recent">New</option><option value="updated">Recently updated</option></select></label>
      </div>
      <p className="result-status" role="status" aria-live="polite">{state === 'loading' ? 'Loading feedback…' : state === 'more' ? 'Loading more feedback…' : `${items.length} ${items.length === 1 ? 'result' : 'results'} loaded`}</p>
      {state === 'invalid' ? <Empty title="These filters aren’t valid" body="Clear the filters or check the shared link and try again." action={() => commit({ q: '', statuses: [], category: '', sort: 'popular' })} />
        : state === 'error' ? <div className="inline-outage" role="alert"><strong>Feedback is temporarily unavailable.</strong><p>We couldn’t reach the connected workspace.</p><button type="button" onClick={() => void load(filters)}>Try again</button></div>
        : state === 'loading' ? <div className="board-loading" aria-hidden="true"><span /><span /><span /></div>
        : items.length === 0 ? <Empty title={filtered ? 'No feedback matches these filters' : 'No feedback yet'} body={filtered ? 'Try changing or clearing your filters.' : 'Be the first to share an idea with the team.'} {...(filtered ? { action: () => commit({ q: '', statuses: [], category: '', sort: filters.sort }) } : {})} />
        : <div className="request-list">{items.map((item) => <article className="request" key={item.id}><button className="vote" type="button" aria-label={`Vote for ${item.title}; ${item.voteCount} votes`}><span aria-hidden="true">↑</span><strong>{item.voteCount}</strong></button><a className="request-copy" href={`/feedback/${item.id}`}><h3>{item.title}</h3><p>{item.description}</p>{item.status && <span className="status">{item.status.name}</span>}{item.category && <span className="category">{item.category.name}</span>}<span className="comments">{item.commentCount} comments</span></a></article>)}</div>}
      {hasMore && state !== 'loading' && <div className="load-more"><button className="secondary-button" disabled={state === 'more'} type="button" onClick={() => void load(filters, nextCursor)}>{state === 'more' ? 'Loading…' : 'Load more'}</button></div>}
    </section>
  </>
}

function Empty({ title, body, action }: { title: string; body: string; action?: () => void }) {
  return <div className="empty-state"><h3>{title}</h3><p>{body}</p>{action && <button type="button" onClick={action}>Clear filters</button>}</div>
}
