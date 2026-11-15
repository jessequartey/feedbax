import { sql } from "drizzle-orm";
import { markdownToText } from "../lib/markdown.ts";
import { posts } from "../db/schema.ts";

// Bodies are stored as Markdown (src/lib/markdown.ts). Lists show a plain-text excerpt and
// search matches the text a reader sees, not the markup.

/** One line of plain text from a stored body. Only the head is parsed: an excerpt never needs more. */
export function excerptOf(body: string, max: number): string {
  return markdownToText(body.slice(0, max * 12), max);
}

/** The characters the stored form adds around text: escapes, emphasis marks and code ticks. */
const MARKUP = /[\\*`]/g;

/** The user's search words as they appear in `plainBodySql` (null when nothing is left). */
export function plainQuery(q: string): string | null {
  const plain = q.replace(MARKUP, "").trim();
  return plain || null;
}

const openPos = "instr(rest, '[')";
const beforeOpen = `substr(rest, 1, ${openPos} - 1)`;
const afterOpen = `substr(rest, ${openPos} + 1)`;
const closePos = `instr(${afterOpen}, '](')`;
const linkLabel = `substr(${afterOpen}, 1, ${closePos} - 1)`;
const afterSchemeStart = `substr(${afterOpen}, ${closePos} + 2)`;
const urlEnd = `instr(${afterSchemeStart}, ')')`;
const linkUrl = `substr(${afterSchemeStart}, 1, ${urlEnd} - 1)`;
const afterLink = `substr(${afterSchemeStart}, ${urlEnd} + 1)`;

const isEscapedOpen = `(length(${beforeOpen}) - length(rtrim(${beforeOpen}, char(92)))) % 2 = 1`;
const isMarkdownLink = `${closePos} > 0
  AND instr(${linkLabel}, '[') = 0
  AND instr(${linkLabel}, char(10)) = 0
  AND (
    lower(substr(${afterSchemeStart}, 1, 7)) = 'http://'
    OR lower(substr(${afterSchemeStart}, 1, 8)) = 'https://'
    OR lower(substr(${afterSchemeStart}, 1, 7)) = 'mailto:'
  )
  AND ${urlEnd} > 0
  AND instr(${linkUrl}, ' ') = 0
  AND instr(${linkUrl}, char(10)) = 0`;

const nextRestSql = `CASE
  WHEN ${openPos} = 0 OR instr(rest, '](') = 0 THEN ''
  WHEN ${isEscapedOpen} THEN ${afterOpen}
  WHEN ${isMarkdownLink} THEN ${afterLink}
  ELSE ${afterOpen}
END`;

const nextOutSql = `out || CASE
  WHEN ${openPos} = 0 OR instr(rest, '](') = 0 THEN rest
  WHEN ${isEscapedOpen} THEN substr(rest, 1, ${openPos})
  WHEN ${isMarkdownLink} THEN ${beforeOpen} || ${linkLabel}
  ELSE substr(rest, 1, ${openPos})
END`;

const strippedLinksSql = sql`(
  WITH RECURSIVE link_strip(rest, out) AS (
    SELECT ${posts.body}, ''
    UNION ALL
    SELECT ${sql.raw(nextRestSql)}, ${sql.raw(nextOutSql)}
    FROM link_strip
    WHERE rest != ''
  )
  SELECT out FROM link_strip WHERE rest = '' LIMIT 1
)`;

/**
 * The stored body with Markdown link destinations, backslash escapes, `*` emphasis marks and
 * backticks removed, so that "really slow" finds "**really** slow", "[WIP]" finds "\[WIP\]",
 * and "secret-destination" does not match `[the guide](https://secret-destination.example)`.
 */
const bodyForPlainSql = sql`CASE WHEN instr(${posts.body}, '](') = 0 THEN ${posts.body} ELSE ${strippedLinksSql} END`;
export const plainBodySql = sql`replace(replace(replace(${bodyForPlainSql}, char(92), ''), '*', ''), char(96), '')`;
