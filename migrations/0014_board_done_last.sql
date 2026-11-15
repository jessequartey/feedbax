CREATE INDEX posts_board_done_last_idx ON posts ((status IN ('done', 'closed')), created_at DESC, id DESC)
  WHERE hidden_at IS NULL AND spam = 0 AND merged_into IS NULL;
