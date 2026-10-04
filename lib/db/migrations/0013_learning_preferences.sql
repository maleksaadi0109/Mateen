-- Optional private, self-reported onboarding answers; no grades or unlocks.
ALTER TABLE mateen_profiles
  ADD COLUMN IF NOT EXISTS learning_preferences jsonb;