import type {
  PublicFeedbackPage,
  PublicFeedbackQuery,
} from "@feedbax/feedback";
import { ArrowRight } from "lucide-react";

import { feedbackStatuses, feedbackTypes } from "./public-feedback-page";

export function PublicFeedbackIndex({
  page,
  search,
}: {
  page: PublicFeedbackPage;
  search: PublicFeedbackQuery;
}) {
  const nextPageSearch = new URLSearchParams();
  if (page.nextCursor) nextPageSearch.set("cursor", page.nextCursor);
  if (search.type) nextPageSearch.set("type", search.type);
  if (search.status) nextPageSearch.set("status", search.status);

  return (
    <main className="feedback-index">
      <section className="feedback-intro" aria-labelledby="feedback-heading">
        <p className="feedback-eyebrow">Public feedback</p>
        <h1 id="feedback-heading">Help shape what we build next.</h1>
        <p className="feedback-deck">
          Browse feature requests, bug reports, and product updates shared by
          the community.
        </p>
      </section>

      <form className="feedback-filters" method="get">
        <label>
          <span>Feedback Type</span>
          <select
            aria-label="Feedback Type"
            name="type"
            defaultValue={search.type ?? ""}
          >
            <option value="">All types</option>
            {feedbackTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Feedback Status</span>
          <select
            aria-label="Feedback Status"
            name="status"
            defaultValue={search.status ?? ""}
          >
            <option value="">All statuses</option>
            {feedbackStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>

      <section className="feedback-results" aria-live="polite">
        <div className="feedback-results-heading">
          <h2>Latest feedback</h2>
          <span>{page.items.length} shown</span>
        </div>

        {page.items.length === 0 ? (
          <div className="feedback-empty">
            <p>No feedback matches these filters.</p>
            <a href="/">Clear filters</a>
          </div>
        ) : (
          <ol className="feedback-list">
            {page.items.map((item) => (
              <li key={`${item.title}-${item.createdAt.toISOString()}`}>
                <article>
                  <div className="feedback-meta">
                    <span>{item.type}</span>
                    <span data-status={item.status}>{item.status}</span>
                    <time dateTime={item.createdAt.toISOString()}>
                      {formatDate(item.createdAt)}
                    </time>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              </li>
            ))}
          </ol>
        )}

        {page.nextCursor ? (
          <a className="feedback-next" href={`/?${nextPageSearch.toString()}`}>
            Next page <ArrowRight aria-hidden="true" />
          </a>
        ) : null}
      </section>
    </main>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
