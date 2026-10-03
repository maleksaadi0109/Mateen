ALTER TABLE mateen_assessment_answers
  DROP CONSTRAINT IF EXISTS mateen_assessment_answers_frozen_reservation_path;

ALTER TABLE mateen_assessment_answers
  ADD CONSTRAINT mateen_assessment_answers_frozen_reservation_path
  CHECK (
    frozen_reservation_path IS NULL OR frozen_reservation_path ~
      '^/objects/([A-Za-z0-9_-][A-Za-z0-9._-]*/)*assessment-audio/frozen/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  );

ALTER TABLE mateen_assessment_audio_cleanup_outbox
  DROP CONSTRAINT IF EXISTS mateen_assessment_audio_cleanup_outbox_object_path_check;

ALTER TABLE mateen_assessment_audio_cleanup_outbox
  DROP CONSTRAINT IF EXISTS mateen_assessment_audio_cleanup_path;

ALTER TABLE mateen_assessment_audio_cleanup_outbox
  ADD CONSTRAINT mateen_assessment_audio_cleanup_path
  CHECK (
    object_path ~
      '^/objects/([A-Za-z0-9_-][A-Za-z0-9._-]*/)*assessment-audio/frozen/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  );

-- Reconcile any reservation rows missed by a previous deployment's outbox
-- writer before relying on the broadened root-or-nested path contract.
INSERT INTO mateen_assessment_audio_cleanup_outbox (
  id,
  attempt_id,
  question_id,
  sequence,
  object_path,
  state,
  lease_expires_at
)
SELECT
  gen_random_uuid()::text,
  attempt_id,
  question_id,
  frozen_reservation_sequence,
  frozen_reservation_path,
  'writing',
  GREATEST(frozen_reservation_expires_at, now() + interval '5 minutes')
FROM mateen_assessment_answers
WHERE frozen_reservation_path IS NOT NULL
ON CONFLICT (object_path) DO NOTHING;