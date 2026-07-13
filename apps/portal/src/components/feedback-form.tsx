import {
  SubmitFeedbackInputSchema,
  type SubmitFeedbackInput,
} from '@feedbax/core'
import type { PublicFeedbackItem } from '@feedbax/core'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApplicationApiError,
  createFeedback,
  getFeedbackSuggestions,
  voteForExistingFeedback,
  type FeedbackCollectionFilters,
} from '../collections/index.js'
import { publicTaxonomy } from '../portal.config.js'
import { ErrorState } from './error-state.js'

const DRAFT_KEY = 'feedbax:feedback-draft:v1'
const emptyDraft = {
  title: '',
  description: '',
  type: 'feature',
  categoryId: '',
  tagIds: [],
} satisfies Draft
type Draft = {
  title: string
  description: string
  type: SubmitFeedbackInput['type']
  categoryId: string
  tagIds: string[]
}

function storedDraft(): Draft {
  if (typeof sessionStorage === 'undefined') return emptyDraft
  try {
    const value = JSON.parse(
      sessionStorage.getItem(DRAFT_KEY) ?? 'null',
    ) as Partial<Draft> | null
    return value ? { ...emptyDraft, ...value } : emptyDraft
  } catch {
    return emptyDraft
  }
}

export function FeedbackForm({
  filters,
  openSignal,
  opener,
}: {
  filters: FeedbackCollectionFilters
  openSignal: number
  opener?: HTMLElement | null
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<Error>()
  const [suggestions, setSuggestions] = useState<readonly PublicFeedbackItem[]>(
    [],
  )
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsMessage, setSuggestionsMessage] = useState('')
  const [suggestionsReady, setSuggestionsReady] = useState(false)
  const [votingId, setVotingId] = useState<string>()
  const navigate = useNavigate()

  useEffect(() => {
    const saved = storedDraft()
    setDraft(saved)
  }, [])
  useEffect(() => {
    if (openSignal > 0 && !dialog.current?.open) {
      returnFocusTo.current =
        opener ?? (document.activeElement as HTMLElement | null)
      dialog.current?.showModal()
      requestAnimationFrame(() =>
        dialog.current
          ?.querySelector<HTMLInputElement>('[name="title"]')
          ?.focus(),
      )
    }
  }, [openSignal, opener])
  useEffect(() => {
    if (
      draft.title ||
      draft.description ||
      draft.categoryId ||
      draft.tagIds.length
    )
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [draft])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        !draft.title &&
        !draft.description &&
        !draft.categoryId &&
        !draft.tagIds.length
      )
        return
      event.preventDefault()
    }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [draft])
  useEffect(() => {
    const title = draft.title.trim()
    if (title.length < 3) {
      setSuggestions([])
      setSuggestionsLoading(false)
      setSuggestionsMessage('')
      setSuggestionsReady(false)
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      setSuggestionsLoading(true)
      setSuggestionsMessage('')
      void getFeedbackSuggestions(title, controller.signal)
        .then((items) => {
          setSuggestions(items)
          setSuggestionsReady(true)
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError')
            return
          setSuggestions([])
          setSuggestionsReady(true)
          setSuggestionsMessage(
            'Suggestions are temporarily unavailable. You can still submit your request.',
          )
        })
        .finally(() => {
          if (!controller.signal.aborted) setSuggestionsLoading(false)
        })
    }, 300)
    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [draft.title])

  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
  }
  const discard = () => {
    sessionStorage.removeItem(DRAFT_KEY)
    setDraft(emptyDraft)
    setErrors({})
    setMessage('')
    setSuggestions([])
    setSuggestionsMessage('')
    setSuggestionsReady(false)
    setActionError(undefined)
    dialog.current?.close()
    returnFocusTo.current?.focus()
  }
  const close = () => {
    dialog.current?.close()
    returnFocusTo.current?.focus()
  }
  const toggleSuggestionVote = async (item: PublicFeedbackItem) => {
    const voted = !(item.hasViewerVoted ?? false)
    setVotingId(item.id)
    setSuggestions((current) =>
      current.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              hasViewerVoted: voted,
              voteCount: Math.max(0, candidate.voteCount + (voted ? 1 : -1)),
            }
          : candidate,
      ),
    )
    try {
      const updated = await voteForExistingFeedback(item.id, voted)
      setSuggestions((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? {
                ...candidate,
                hasViewerVoted: updated.voted,
                voteCount: updated.voteCount,
              }
            : candidate,
        ),
      )
    } catch (error) {
      setSuggestions((current) =>
        current.map((candidate) =>
          candidate.id === item.id ? item : candidate,
        ),
      )
      if (
        error instanceof ApplicationApiError &&
        error.status === 401 &&
        error.loginLocation
      ) {
        setActionError(error)
        return
      }
      if (error instanceof Error) setActionError(error)
      setSuggestionsMessage(
        error instanceof Error
          ? error.message
          : 'Your vote could not be saved.',
      )
    } finally {
      setVotingId(undefined)
    }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const input = {
      title: draft.title,
      description: draft.description,
      type: draft.type,
      ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
      tagIds: draft.tagIds,
    }
    const result = SubmitFeedbackInputSchema.safeParse(input)
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors
      setErrors(
        Object.fromEntries(
          Object.entries(fields).map(([key, values]) => [
            key,
            values?.[0] ?? 'Invalid value',
          ]),
        ),
      )
      setMessage('Check the highlighted fields and try again.')
      const first = result.error.issues[0]?.path[0]
      if (typeof first === 'string')
        dialog.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }
    setSubmitting(true)
    setActionError(undefined)
    setMessage('Submitting feedback…')
    try {
      const created = await createFeedback(filters, result.data)
      sessionStorage.removeItem(DRAFT_KEY)
      setDraft(emptyDraft)
      dialog.current?.close()
      await navigate({ to: '/feedback/$id', params: { id: created.id } })
    } catch (error) {
      if (
        error instanceof ApplicationApiError &&
        error.status === 401 &&
        error.loginLocation
      ) {
        setActionError(error)
        return
      }
      if (error instanceof Error) setActionError(error)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Feedback could not be submitted.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      className="feedback-dialog"
      ref={dialog}
      aria-labelledby="feedback-form-title"
      aria-describedby="feedback-form-description"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <form method="dialog" onSubmit={(event) => void submit(event)} noValidate>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">New feedback</p>
            <h2 id="feedback-form-title">Share an Idea</h2>
            <p id="feedback-form-description">
              Tell us what would make the product work better for you.
            </p>
          </div>
          <button
            className="dialog-close"
            type="button"
            onClick={close}
            aria-label="Close submission form"
          >
            ×
          </button>
        </div>
        <label>
          <span>Title</span>
          <input
            name="title"
            value={draft.title}
            onChange={(event) => change('title', event.target.value)}
            maxLength={200}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? 'title-error' : undefined}
            autoComplete="off"
          />
        </label>
        {errors.title && (
          <small className="field-error" id="title-error" role="alert">
            {errors.title}
          </small>
        )}
        {draft.title.trim().length >= 3 && (
          <section
            className="duplicate-suggestions"
            aria-labelledby="duplicate-suggestions-title"
            aria-busy={suggestionsLoading}
          >
            <div className="suggestion-heading">
              <strong id="duplicate-suggestions-title">Similar feedback</strong>
              <span>
                {suggestionsLoading
                  ? 'Checking…'
                  : suggestions.length > 0
                    ? 'Vote instead if one matches'
                    : suggestionsReady
                      ? 'No close matches'
                      : ''}
              </span>
            </div>
            {suggestions.length > 0 && (
              <div className="suggestion-list">
                {suggestions.map((item) => (
                  <article className="suggestion" key={item.id}>
                    <a href={`/feedback/${item.id}`}>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                      <small>
                        {[item.status?.name, item.category?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </a>
                    <button
                      type="button"
                      className="suggestion-vote"
                      aria-pressed={item.hasViewerVoted ?? false}
                      aria-label={`Vote for ${item.title}; ${item.voteCount} votes`}
                      disabled={votingId === item.id}
                      onClick={() => void toggleSuggestionVote(item)}
                    >
                      <span aria-hidden="true">↑</span>
                      <strong>{item.voteCount}</strong>
                    </button>
                  </article>
                ))}
              </div>
            )}
            <p className="suggestion-status" role="status" aria-live="polite">
              {suggestionsMessage ||
                (!suggestionsLoading && suggestionsReady
                  ? 'None of these match? Continue with your new request.'
                  : '')}
            </p>
          </section>
        )}
        <label>
          <span>Description</span>
          <textarea
            name="description"
            value={draft.description}
            onChange={(event) => change('description', event.target.value)}
            rows={6}
            maxLength={20000}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? 'description-error' : undefined
            }
            autoComplete="off"
          />
        </label>
        {errors.description && (
          <small className="field-error" id="description-error" role="alert">
            {errors.description}
          </small>
        )}
        <fieldset>
          <legend>Type</legend>
          <div className="type-options">
            {(['feature', 'bug', 'improvement', 'question'] as const).map(
              (type) => (
                <label key={type}>
                  <input
                    name="type"
                    type="radio"
                    value={type}
                    checked={draft.type === type}
                    onChange={() => change('type', type)}
                  />
                  <span>{type[0]!.toUpperCase() + type.slice(1)}</span>
                </label>
              ),
            )}
          </div>
        </fieldset>
        <label>
          <span>
            Category <small>Optional</small>
          </span>
          <select
            name="categoryId"
            value={draft.categoryId}
            onChange={(event) => change('categoryId', event.target.value)}
          >
            <option value="">No category</option>
            {publicTaxonomy.categories.map((category) => (
              <option value={category.id} key={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        {publicTaxonomy.tags.length > 0 && (
          <fieldset>
            <legend>
              Tags <small>Optional</small>
            </legend>
            <div className="tag-options">
              {publicTaxonomy.tags.map((tag) => (
                <label key={tag.id}>
                  <input
                    name="tagIds"
                    type="checkbox"
                    checked={draft.tagIds.includes(tag.id)}
                    onChange={() =>
                      change(
                        'tagIds',
                        draft.tagIds.includes(tag.id)
                          ? draft.tagIds.filter((id) => id !== tag.id)
                          : [...draft.tagIds, tag.id],
                      )
                    }
                  />
                  <span>{tag.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="form-message" role="status" aria-live="polite">
          {message}
        </p>
        {actionError ? <ErrorState error={actionError} scope="action" /> : null}
        <div className="dialog-actions">
          <button type="button" className="discard-button" onClick={discard}>
            Discard
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit feedback'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
