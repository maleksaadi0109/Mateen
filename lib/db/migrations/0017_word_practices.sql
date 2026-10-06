CREATE TABLE IF NOT EXISTS mateen_word_practices (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  selection jsonb NOT NULL,
  attempts jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS mateen_word_practices_owner_request ON mateen_word_practices(user_id,request_id);
CREATE INDEX IF NOT EXISTS mateen_word_practices_owner_created ON mateen_word_practices(user_id,created_at);
