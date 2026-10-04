-- Preserve historical Nawawi attempts while isolating each book's progression.
ALTER TABLE mateen_stage_attempts
  ADD COLUMN IF NOT EXISTS text_id text NOT NULL DEFAULT 'nawawi';