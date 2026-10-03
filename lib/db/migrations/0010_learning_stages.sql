CREATE TABLE IF NOT EXISTS mateen_learning_stages (
  user_id text NOT NULL,
  text_id text NOT NULL,
  stage_number integer NOT NULL,
  best_percent integer NOT NULL,
  passed_at timestamptz,
  PRIMARY KEY (user_id, text_id, stage_number)
);
CREATE TABLE IF NOT EXISTS mateen_stage_attempts (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  request_id text NOT NULL,
  stage_number integer NOT NULL,
  source_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  result jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS mateen_stage_attempt_owner_request ON mateen_stage_attempts(user_id, request_id);
CREATE INDEX IF NOT EXISTS mateen_stage_attempt_expiry ON mateen_stage_attempts(expires_at);