CREATE TABLE post_follows (
  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  following integer NOT NULL DEFAULT 1,
  updated_at integer NOT NULL,
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT post_follows_following CHECK (following IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX post_follows_user_idx ON post_follows (user_id);
