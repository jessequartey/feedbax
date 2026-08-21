import type { PublicFeedbackQuery, PublicPostPage } from "@feedbax/feedback";
import { Search } from "lucide-react";
import { postStatuses, postTypes } from "./public-feedback-page";
import { DraftPostList } from "./draft-post-list";
import { PostResults } from "./post-results";

export function PublicFeedbackIndex({
  page,
  search,
}: {
  page: PublicPostPage;
  search: PublicFeedbackQuery;
}) {
  const activeCount =
    (search.types?.length ?? 0) + (search.statuses?.length ?? 0);
  return (
    <main className="feedback-index">
      <section className="feedback-intro" aria-labelledby="feedback-heading">
        <h1 id="feedback-heading">Help shape what we build</h1>
        <p className="feedback-deck">
          Share ideas, report bugs, and follow the Posts shaping the product.
        </p>
      </section>
      <form className="post-controls" method="get">
        <label className="post-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search Posts</span>
          <input
            name="search"
            type="search"
            defaultValue={search.search}
            placeholder="Search Posts"
          />
        </label>
        <label>
          <span>Sort</span>
          <select name="sort" defaultValue={search.sort ?? "trending"}>
            <option value="trending">Trending</option>
            <option value="top">Top</option>
            <option value="new">New</option>
          </select>
        </label>
        <details className="post-filters">
          <summary>Filters{activeCount ? ` (${activeCount})` : ""}</summary>
          <fieldset>
            <legend>Post Types</legend>
            {postTypes.map((type) => (
              <label key={type}>
                <input
                  type="checkbox"
                  name="types"
                  value={type}
                  defaultChecked={search.types?.includes(type)}
                />
                {type}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Post Statuses</legend>
            {postStatuses.map((status) => (
              <label key={status}>
                <input
                  type="checkbox"
                  name="statuses"
                  value={status}
                  defaultChecked={search.statuses?.includes(status)}
                />
                {status}
              </label>
            ))}
          </fieldset>
          <div>
            <a href="/">Clear All</a>
            <button type="submit">Apply</button>
          </div>
        </details>
        <button type="submit">Update</button>
      </form>
      <section className="feedback-results" aria-live="polite">
        <div className="feedback-results-heading">
          <h2>Posts</h2>
          <span>{page.items.length} shown</span>
        </div>
        <DraftPostList search={search} />
        <PostResults
          initialItems={page.items}
          nextCursor={page.nextCursor}
          search={search}
        />
      </section>
    </main>
  );
}
