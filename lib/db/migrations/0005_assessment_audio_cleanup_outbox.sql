CREATE TABLE mateen_assessment_audio_cleanup_outbox (
  id text PRIMARY KEY,
  attempt_id text NOT NULL,
  question_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  object_path text NOT NULL UNIQUE
    CHECK (object_path LIKE '/objects/%/assessment-audio/frozen/%'),
  state text NOT NULL CHECK (state IN ('reserved', 'writing', 'cleanup_pending')),
  lease_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mateen_assessment_audio_cleanup_job UNIQUE (attempt_id, question_id, sequence)
);

CREATE INDEX mateen_assessment_audio_cleanup_due
  ON mateen_assessment_audio_cleanup_outbox(state, lease_expires_at);

-- Preserve reservations created by the preceding deployment before enabling
-- cleanup through the independent outbox.
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