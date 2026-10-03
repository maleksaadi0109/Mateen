CREATE TABLE IF NOT EXISTS mateen_practice_reports (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  attempt_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  summary jsonb NOT NULL,
  issues jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS mateen_practice_reports_owner_attempt ON mateen_practice_reports(user_id, attempt_id);
CREATE INDEX IF NOT EXISTS mateen_practice_reports_owner_created ON mateen_practice_reports(user_id, created_at);