import type { ChangelogPublishedSink } from "../server/changelog-events.ts";
import { richText } from "./content.ts";
import { emailEnabled, queueEmails } from "./events.ts";

// Changelog email is a sink on `changelog.published` (06). It only enqueues: the recipients
// are picked, and the email sent, by the queue consumer (deliver.ts), and only people who
// opted in get one.
export const changelogEmailSink: ChangelogPublishedSink = async ({ entry, url }) => {
  if (!emailEnabled()) return;
  await queueEmails([
    {
      type: "email.changelog",
      id: crypto.randomUUID(),
      entry: { id: entry.id, title: entry.title, body: richText(entry.body), url },
    },
  ]);
};
