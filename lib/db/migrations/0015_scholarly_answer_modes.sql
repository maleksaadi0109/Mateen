-- Additive only. Historical rows are deliberately not classified as sourced.
BEGIN;
ALTER TABLE mateen_scholarly_sources ADD COLUMN IF NOT EXISTS text_id text;
ALTER TABLE mateen_scholarly_questions ADD COLUMN IF NOT EXISTS answer_mode text NOT NULL DEFAULT 'legacy';
ALTER TABLE mateen_scholarly_questions ADD COLUMN IF NOT EXISTS evaluation_id uuid;
ALTER TABLE mateen_scholarly_messages ADD COLUMN IF NOT EXISTS answer_mode text;
COMMIT;
