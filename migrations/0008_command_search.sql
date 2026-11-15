-- FTS5 is supported by D1. Rowids are disjoint: 2 * posts.rowid, 2 * changelog_entries.rowid + 1.
-- Only search data is added; the source tables are never rewritten.
CREATE VIRTUAL TABLE portal_search USING fts5(
  id UNINDEXED, kind UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3 4'
);
--> statement-breakpoint
-- A transient input row lets all six source triggers and the backfill share one projection.
-- The AFTER INSERT trigger consumes it immediately; this table stays empty.
CREATE TABLE portal_search_input (
  rowid INTEGER PRIMARY KEY, id TEXT NOT NULL, kind TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT NOT NULL
);
--> statement-breakpoint
-- Lexical projection of the canonical Markdown stored by markdown-write.ts. Escapes and
-- code contents are literal; emphasis delimiters and link destinations are not visible words.
-- This is not an HTML renderer. Excerpts still use src/lib/markdown.ts. Token parity with that
-- parser is tested (including links, nested emphasis, escaped syntax and fenced/inline code).
CREATE TRIGGER portal_search_project AFTER INSERT ON portal_search_input BEGIN
  INSERT INTO portal_search(rowid, id, kind, title, body)
  WITH RECURSIVE scan(pos, mode, ticks, piece) AS (
    SELECT 1, 'text', 0, ''
    UNION ALL
    SELECT
      CASE
        WHEN mode != 'inline' AND (pos = 1 OR substr(NEW.body, pos - 1, 1) = char(10))
          AND substr(NEW.body, pos, 3) = '```'
          AND (mode = 'text' OR (CASE WHEN length(ltrim(substr(NEW.body, pos, 64), '`')) = 0 THEN length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '`')) ELSE length(substr(NEW.body, pos, 64)) - length(ltrim(substr(NEW.body, pos, 64), '`')) END) >= ticks)
          THEN pos + CASE WHEN instr(substr(NEW.body, pos), char(10)) = 0
            THEN length(substr(NEW.body, pos)) ELSE instr(substr(NEW.body, pos), char(10)) END
        WHEN mode != 'fence' AND substr(NEW.body, pos, 1) = '`'
          THEN pos + (CASE WHEN length(ltrim(substr(NEW.body, pos, 64), '`')) = 0 THEN length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '`')) ELSE length(substr(NEW.body, pos, 64)) - length(ltrim(substr(NEW.body, pos, 64), '`')) END)
        WHEN mode = 'text' AND substr(NEW.body, pos, 1) = char(92) THEN pos + 2
        WHEN mode = 'text' AND substr(NEW.body, pos, 2) = ']('
          AND instr(substr(NEW.body, pos + 2), ')') > 0
          THEN pos + 2 + instr(substr(NEW.body, pos + 2), ')')
        WHEN mode = 'text' AND (pos = 1 OR substr(NEW.body, pos - 1, 1) = char(10)) AND substr(NEW.body, pos, 1) GLOB '[0-9]' AND substr(NEW.body, pos + length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '0123456789')), 2) = '. ' THEN pos + length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '0123456789')) + 2
        WHEN substr(NEW.body, pos, 1) NOT IN (char(92), char(96), '*', '_', '[', ']', char(10)) THEN pos + (min(coalesce(nullif(instr(substr(NEW.body, pos, 256), char(92)), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), char(96)), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), '*'), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), '_'), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), '['), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), ']'), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), char(10)), 0), length(substr(NEW.body, pos, 256)) + 1)) - 1)
        ELSE pos + 1 END,
      CASE
        WHEN mode != 'inline' AND (pos = 1 OR substr(NEW.body, pos - 1, 1) = char(10))
          AND substr(NEW.body, pos, 3) = '```'
          AND (mode = 'text' OR (CASE WHEN length(ltrim(substr(NEW.body, pos, 64), '`')) = 0 THEN length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '`')) ELSE length(substr(NEW.body, pos, 64)) - length(ltrim(substr(NEW.body, pos, 64), '`')) END) >= ticks)
          THEN CASE WHEN mode = 'fence' THEN 'text' ELSE 'fence' END
        WHEN mode != 'fence' AND substr(NEW.body, pos, 1) = '`' THEN
          CASE WHEN mode = 'text' THEN 'inline'
            WHEN (CASE WHEN length(ltrim(substr(NEW.body, pos, 64), '`')) = 0 THEN length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '`')) ELSE length(substr(NEW.body, pos, 64)) - length(ltrim(substr(NEW.body, pos, 64), '`')) END) = ticks THEN 'text'
            ELSE mode END
        ELSE mode END,
      CASE WHEN mode = 'text' AND substr(NEW.body, pos, 1) = '`'
        THEN (CASE WHEN length(ltrim(substr(NEW.body, pos, 64), '`')) = 0 THEN length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '`')) ELSE length(substr(NEW.body, pos, 64)) - length(ltrim(substr(NEW.body, pos, 64), '`')) END) ELSE ticks END,
      CASE
        WHEN mode != 'inline' AND (pos = 1 OR substr(NEW.body, pos - 1, 1) = char(10))
          AND substr(NEW.body, pos, 3) = '```'
          AND (mode = 'text' OR (CASE WHEN length(ltrim(substr(NEW.body, pos, 64), '`')) = 0 THEN length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '`')) ELSE length(substr(NEW.body, pos, 64)) - length(ltrim(substr(NEW.body, pos, 64), '`')) END) >= ticks) THEN ' '
        WHEN mode != 'fence' AND substr(NEW.body, pos, 1) = '`' THEN
          CASE WHEN mode = 'inline' AND (CASE WHEN length(ltrim(substr(NEW.body, pos, 64), '`')) = 0 THEN length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '`')) ELSE length(substr(NEW.body, pos, 64)) - length(ltrim(substr(NEW.body, pos, 64), '`')) END) != ticks
            THEN substr(NEW.body, pos, (CASE WHEN length(ltrim(substr(NEW.body, pos, 64), '`')) = 0 THEN length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '`')) ELSE length(substr(NEW.body, pos, 64)) - length(ltrim(substr(NEW.body, pos, 64), '`')) END)) ELSE '' END
        WHEN mode = 'text' AND (pos = 1 OR substr(NEW.body, pos - 1, 1) = char(10)) AND substr(NEW.body, pos, 1) GLOB '[0-9]' AND substr(NEW.body, pos + length(substr(NEW.body, pos)) - length(ltrim(substr(NEW.body, pos), '0123456789')), 2) = '. ' THEN ''
        WHEN substr(NEW.body, pos, 1) NOT IN (char(92), char(96), '*', '_', '[', ']', char(10)) THEN substr(NEW.body, pos, min(coalesce(nullif(instr(substr(NEW.body, pos, 256), char(92)), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), char(96)), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), '*'), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), '_'), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), '['), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), ']'), 0), length(substr(NEW.body, pos, 256)) + 1), coalesce(nullif(instr(substr(NEW.body, pos, 256), char(10)), 0), length(substr(NEW.body, pos, 256)) + 1)) - 1)
        WHEN mode != 'text' THEN substr(NEW.body, pos, 1)
        WHEN substr(NEW.body, pos, 1) = char(92) THEN substr(NEW.body, pos + 1, 1)
        WHEN substr(NEW.body, pos, 2) = '](' AND instr(substr(NEW.body, pos + 2), ')') > 0 THEN ''
        WHEN substr(NEW.body, pos, 1) IN ('*', '[') THEN ''
        WHEN substr(NEW.body, pos, 1) = '_' AND
          (substr(NEW.body, pos - 1, 1) = '_' OR substr(NEW.body, pos + 1, 1) = '_' OR
            pos = 1 OR substr(NEW.body, pos - 1, 1) GLOB '[^a-zA-Z0-9_À-￿]' OR
            pos = length(NEW.body) OR substr(NEW.body, pos + 1, 1) GLOB '[^a-zA-Z0-9_À-￿]') THEN ''
        ELSE substr(NEW.body, pos, 1) END
    FROM scan WHERE pos <= length(NEW.body)
  )
  SELECT NEW.rowid, NEW.id, NEW.kind, NEW.title, coalesce(group_concat(piece, ''), '') FROM scan;
  DELETE FROM portal_search_input WHERE rowid = NEW.rowid;
END;
--> statement-breakpoint
CREATE TRIGGER posts_search_insert AFTER INSERT ON posts BEGIN
  INSERT INTO portal_search_input VALUES (2 * NEW.rowid + 0, NEW.id, 'feedback', NEW.title, NEW.body);
END;
--> statement-breakpoint
CREATE TRIGGER posts_search_update AFTER UPDATE OF title, body ON posts BEGIN
  DELETE FROM portal_search WHERE rowid = 2 * OLD.rowid + 0;
  INSERT INTO portal_search_input VALUES (2 * NEW.rowid + 0, NEW.id, 'feedback', NEW.title, NEW.body);
END;
--> statement-breakpoint
CREATE TRIGGER posts_search_delete AFTER DELETE ON posts BEGIN
  DELETE FROM portal_search WHERE rowid = 2 * OLD.rowid + 0;
END;
--> statement-breakpoint
CREATE TRIGGER changelog_entries_search_insert AFTER INSERT ON changelog_entries BEGIN
  INSERT INTO portal_search_input VALUES (2 * NEW.rowid + 1, NEW.id, 'changelog', NEW.title, NEW.body);
END;
--> statement-breakpoint
CREATE TRIGGER changelog_entries_search_update AFTER UPDATE OF title, body ON changelog_entries BEGIN
  DELETE FROM portal_search WHERE rowid = 2 * OLD.rowid + 1;
  INSERT INTO portal_search_input VALUES (2 * NEW.rowid + 1, NEW.id, 'changelog', NEW.title, NEW.body);
END;
--> statement-breakpoint
CREATE TRIGGER changelog_entries_search_delete AFTER DELETE ON changelog_entries BEGIN
  DELETE FROM portal_search WHERE rowid = 2 * OLD.rowid + 1;
END;
--> statement-breakpoint
-- Backfill existing 0.3.1 content through the same projection as new writes.
INSERT INTO portal_search_input SELECT 2 * rowid, id, 'feedback', title, body FROM posts;
--> statement-breakpoint
INSERT INTO portal_search_input SELECT 2 * rowid + 1, id, 'changelog', title, body FROM changelog_entries;
