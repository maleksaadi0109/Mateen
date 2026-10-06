CREATE TABLE IF NOT EXISTS mateen_daily_plans (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES mateen_profiles(clerk_id) ON DELETE CASCADE,
  day date NOT NULL,
  timezone text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  daily_minutes integer NOT NULL,
  goal text NOT NULL,
  tasks jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mateen_daily_plans_owner_day UNIQUE(user_id, day)
);
