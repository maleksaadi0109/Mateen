-- No backfill: reports and saved positions do not establish actual study days.
CREATE TABLE IF NOT EXISTS mateen_study_activity_settings (
  user_id text PRIMARY KEY REFERENCES mateen_profiles(clerk_id) ON DELETE CASCADE,
  timezone text NOT NULL
);
CREATE TABLE IF NOT EXISTS mateen_study_activity_days (
  user_id text NOT NULL REFERENCES mateen_profiles(clerk_id) ON DELETE CASCADE,
  day date NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS mateen_study_activity_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES mateen_profiles(clerk_id) ON DELETE CASCADE,
  request_id text NOT NULL,
  kind text NOT NULL,
  page integer NOT NULL,
  started_at timestamptz NOT NULL,
  completed_day date
);
CREATE UNIQUE INDEX IF NOT EXISTS mateen_activity_session_request ON mateen_study_activity_sessions(user_id, request_id);
CREATE INDEX IF NOT EXISTS mateen_activity_session_started ON mateen_study_activity_sessions(started_at);