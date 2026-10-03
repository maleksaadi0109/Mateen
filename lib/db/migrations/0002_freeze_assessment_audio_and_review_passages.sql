-- Preserve signed-upload cleanup tracking and give each immutable recitation window
-- its own review identity without deleting or merging existing scheduled reviews.
ALTER TABLE mateen_assessment_answers
  ADD COLUMN upload_storage_path text;

-- Existing storage_path values are signed upload keys, never immutable
-- adjudication snapshots. Quarantine them from reviewers and retain only for
-- bounded signed-URL expiry cleanup; already human-scored results stay intact.
UPDATE mateen_assessment_answers
SET
  upload_storage_path = COALESCE(upload_storage_path, storage_path),
  upload_expires_at = COALESCE(upload_expires_at, now() - interval '2 minutes'),
  storage_path = NULL,
  audio_available = false,
  status = CASE WHEN status = 'pending' THEN 'technical_review' ELSE status END,
  technical_issue = CASE
    WHEN status = 'pending' THEN COALESCE(technical_issue, 'Legacy mutable upload requires technical review.')
    ELSE technical_issue
  END,
  updated_at = now()
WHERE storage_path IS NOT NULL;

CREATE FUNCTION mateen_guard_assessment_frozen_audio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.storage_path IS NOT NULL
     AND NEW.storage_path IS NOT NULL
     AND NEW.storage_path IS DISTINCT FROM OLD.storage_path THEN
    RAISE EXCEPTION 'A frozen assessment recording cannot be replaced';
  END IF;
  IF NEW.audio_available AND NEW.storage_path IS NULL THEN
    RAISE EXCEPTION 'Available assessment audio must reference a frozen recording';
  END IF;
  IF OLD.audio_available AND NEW.audio_available
     AND ROW(
       NEW.storage_path, NEW.expected_size_bytes, NEW.expected_content_type,
       NEW.actual_duration_seconds, NEW.audio_sequence, NEW.audio_expires_at
     ) IS DISTINCT FROM ROW(
       OLD.storage_path, OLD.expected_size_bytes, OLD.expected_content_type,
       OLD.actual_duration_seconds, OLD.audio_sequence, OLD.audio_expires_at
     ) THEN
    RAISE EXCEPTION 'A confirmed assessment recording is immutable';
  END IF;
  IF OLD.storage_path IS NOT NULL AND NEW.storage_path IS NULL AND NOT NEW.audio_delete_pending THEN
    RAISE EXCEPTION 'A frozen assessment recording must be tombstoned before deletion';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mateen_assessment_frozen_audio_immutable
  BEFORE UPDATE ON mateen_assessment_answers
  FOR EACH ROW EXECUTE FUNCTION mateen_guard_assessment_frozen_audio();

UPDATE mateen_assessment_attempts AS attempt
SET status = 'technical_review', updated_at = now()
WHERE attempt.status IN ('in_progress', 'paused_connection', 'submitted')
  AND EXISTS (
    SELECT 1
    FROM mateen_assessment_answers AS answer
    WHERE answer.attempt_id = attempt.id
      AND answer.status = 'technical_review'
      AND answer.upload_storage_path IS NOT NULL
  );

ALTER TABLE mateen_scheduled_reviews
  ADD COLUMN passage_key text,
  ADD COLUMN source_version text,
  ADD COLUMN window_start_word integer,
  ADD COLUMN passage_prompt text,
  ADD COLUMN reference_text text;

-- Retain exact source snapshots where the old review already identifies its
-- originating assessment question. Orphaned legacy rows remain explicitly
-- unresolved instead of being silently rebound to today's corpus.
UPDATE mateen_scheduled_reviews AS review
SET
  passage_prompt = answer.prompt,
  reference_text = answer.reference_text,
  source_version = attempt.source_version,
  window_start_word = COALESCE((
    SELECT NULLIF(question->'sourceSelection'->>'windowStartWord', '')::integer
    FROM jsonb_array_elements(attempt.questions_snapshot) AS item(question)
    WHERE question->>'id' = review.source_question_id
    LIMIT 1
  ), 0)
FROM mateen_assessment_attempts AS attempt
JOIN mateen_assessment_answers AS answer
  ON answer.attempt_id = attempt.id
WHERE review.source_attempt_id = attempt.id
  AND review.source_question_id = answer.question_id;

UPDATE mateen_scheduled_reviews
SET
  passage_key = 'legacy:' || id,
  source_version = COALESCE(source_version, 'legacy-unresolved'),
  window_start_word = COALESCE(window_start_word, 0);

ALTER TABLE mateen_scheduled_reviews
  ALTER COLUMN passage_key SET NOT NULL,
  ALTER COLUMN source_version SET NOT NULL,
  ALTER COLUMN window_start_word SET NOT NULL,
  ADD CONSTRAINT mateen_scheduled_reviews_passage_key_nonempty CHECK (length(passage_key) > 0),
  ADD CONSTRAINT mateen_scheduled_reviews_window_start_nonnegative CHECK (window_start_word >= 0);

CREATE UNIQUE INDEX mateen_scheduled_reviews_owner_passage
  ON mateen_scheduled_reviews(user_id, passage_key);

-- The new identity index is in place before removing the coarser hadith-level
-- key. Migration 0001 declares UNIQUE(user_id, hadith_number), which PostgreSQL
-- stores as an automatically named UNIQUE constraint (not the guessed
-- mateen_scheduled_reviews_owner_hadith index). Match by the actual key columns
-- so this remains safe if the generated constraint/index name differs.
DO $$
DECLARE
  old_constraint record;
  old_index record;
BEGIN
  FOR old_constraint IN
    SELECT constraint_row.conname
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'mateen_scheduled_reviews'::regclass
      AND constraint_row.contype = 'u'
      AND (
        SELECT array_agg(attribute_row.attname::text ORDER BY key_column.ordinality)
        FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN pg_attribute AS attribute_row
          ON attribute_row.attrelid = constraint_row.conrelid
         AND attribute_row.attnum = key_column.attnum
      ) = ARRAY['user_id', 'hadith_number']::text[]
  LOOP
    EXECUTE format(
      'ALTER TABLE mateen_scheduled_reviews DROP CONSTRAINT %I',
      old_constraint.conname
    );
  END LOOP;

  FOR old_index IN
    SELECT namespace_row.nspname, index_row.relname
    FROM pg_index AS index_metadata
    JOIN pg_class AS index_row ON index_row.oid = index_metadata.indexrelid
    JOIN pg_namespace AS namespace_row ON namespace_row.oid = index_row.relnamespace
    WHERE index_metadata.indrelid = 'mateen_scheduled_reviews'::regclass
      AND index_metadata.indisunique
      AND index_metadata.indisvalid
      AND index_metadata.indpred IS NULL
      AND index_metadata.indexprs IS NULL
      AND index_metadata.indnkeyatts = 2
      AND (
        SELECT array_agg(attribute_row.attname::text ORDER BY key_column.ordinality)
        FROM unnest(index_metadata.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
        JOIN pg_attribute AS attribute_row
          ON attribute_row.attrelid = index_metadata.indrelid
         AND attribute_row.attnum = key_column.attnum
        WHERE key_column.ordinality <= index_metadata.indnkeyatts
      ) = ARRAY['user_id', 'hadith_number']::text[]
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conindid = index_metadata.indexrelid
      )
  LOOP
    EXECUTE format('DROP INDEX %I.%I', old_index.nspname, old_index.relname);
  END LOOP;
END $$;

CREATE FUNCTION mateen_guard_scheduled_review_source_immutables() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(
       NEW.user_id, NEW.text_id, NEW.hadith_number, NEW.passage_key,
       NEW.source_version, NEW.window_start_word, NEW.passage_prompt,
       NEW.reference_text, NEW.source_attempt_id, NEW.source_question_id,
       NEW.source_mistake
     )
     IS DISTINCT FROM
     ROW(
       OLD.user_id, OLD.text_id, OLD.hadith_number, OLD.passage_key,
       OLD.source_version, OLD.window_start_word, OLD.passage_prompt,
       OLD.reference_text, OLD.source_attempt_id, OLD.source_question_id,
       OLD.source_mistake
     ) THEN
    RAISE EXCEPTION 'Scheduled review passage identity and source snapshot are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mateen_scheduled_review_source_immutables
  BEFORE UPDATE ON mateen_scheduled_reviews
  FOR EACH ROW EXECUTE FUNCTION mateen_guard_scheduled_review_source_immutables();