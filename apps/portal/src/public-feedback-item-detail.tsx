import type { PublicFeedbackItem } from "@feedbax/feedback";
import { ArrowLeft } from "lucide-react";

import { formatPublicDate } from "./public-date";

export function PublicFeedbackItemDetail({
  item,
}: {
  item: PublicFeedbackItem;
}) {
  return (
    <main className="feedback-detail">
      <a className="feedback-detail-back" href="/">
        <ArrowLeft aria-hidden="true" /> Back to feedback
      </a>

      <article aria-labelledby="feedback-item-heading">
        <div className="feedback-detail-meta">
          <span>{item.type}</span>
          <span>{item.status}</span>
        </div>
        <h1 id="feedback-item-heading">{item.title}</h1>
        <p className="feedback-detail-description">{item.description}</p>
        <dl className="feedback-detail-dates">
          <div>
            <dt>Submitted</dt>
            <dd>
              <time dateTime={item.createdAt.toISOString()}>
                {formatPublicDate(item.createdAt, "long")}
              </time>
            </dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>
              <time dateTime={item.updatedAt.toISOString()}>
                {formatPublicDate(item.updatedAt, "long")}
              </time>
            </dd>
          </div>
        </dl>
      </article>
    </main>
  );
}
