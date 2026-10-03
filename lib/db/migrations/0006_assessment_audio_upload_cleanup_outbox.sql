CREATE TABLE mateen_assessment_audio_upload_cleanup_outbox (
  id text PRIMARY KEY,
  attempt_id text NOT NULL,
  question_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  object_path text NOT NULL UNIQUE CHECK (object_path LIKE '/objects/uploads/%'),
  state text NOT NULL CHECK (state IN ('pending', 'cleanup_pending')),
  lease_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mateen_assessment_audio_upload_cleanup_job
    UNIQUE (attempt_id, question_id, sequence)
);

CREATE INDEX mateen_assessment_audio_upload_cleanup_due
  ON mateen_assessment_audio_upload_cleanup_outbox(state, lease_expires_at);