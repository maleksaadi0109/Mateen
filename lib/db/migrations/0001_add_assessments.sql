-- Additive assessment migration: preserves all existing study/recitation data.
CREATE TYPE mateen_assessment_status AS ENUM
  ('in_progress', 'paused_connection', 'submitted', 'technical_review', 'passed', 'failed');

CREATE TABLE mateen_assessment_attempts (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  status mateen_assessment_status NOT NULL DEFAULT 'in_progress',
  text_id text NOT NULL DEFAULT 'nawawi' CHECK (text_id = 'nawawi'),
  source_version text NOT NULL,
  canonical_hash text NOT NULL,
  policy_snapshot jsonb NOT NULL,
  questions_snapshot jsonb NOT NULL,
  session_id text NOT NULL,
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds BETWEEN 0 AND 1800),
  active_milliseconds integer NOT NULL DEFAULT 0 CONSTRAINT mateen_assessment_attempts_active_milliseconds CHECK (active_milliseconds BETWEEN 0 AND 999),
  current_question_position integer NOT NULL DEFAULT 0 CHECK (current_question_position BETWEEN 0 AND 29),
  last_heartbeat_at timestamptz,
  last_trusted_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  retry_available_at timestamptz,
  result jsonb,
  submit_mutation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mateen_assessment_attempts_owner_created ON mateen_assessment_attempts(user_id, created_at);
CREATE INDEX mateen_assessment_attempts_status_created ON mateen_assessment_attempts(status, created_at);
CREATE UNIQUE INDEX mateen_assessment_attempts_one_active_owner
  ON mateen_assessment_attempts(user_id)
  WHERE status IN ('in_progress', 'paused_connection');
CREATE UNIQUE INDEX mateen_assessment_attempts_submit_mutation
  ON mateen_assessment_attempts(user_id, submit_mutation_id) WHERE submit_mutation_id IS NOT NULL;

CREATE FUNCTION mateen_guard_assessment_attempt_immutables() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.source_version, NEW.canonical_hash, NEW.policy_snapshot, NEW.questions_snapshot)
       IS DISTINCT FROM
     ROW(OLD.source_version, OLD.canonical_hash, OLD.policy_snapshot, OLD.questions_snapshot) THEN
    RAISE EXCEPTION 'Assessment source and policy snapshots are immutable';
  END IF;
  IF OLD.result IS NOT NULL AND NEW.result IS DISTINCT FROM OLD.result THEN
    RAISE EXCEPTION 'A finalized assessment result is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mateen_assessment_attempt_immutables
  BEFORE UPDATE ON mateen_assessment_attempts
  FOR EACH ROW EXECUTE FUNCTION mateen_guard_assessment_attempt_immutables();

CREATE TABLE mateen_assessment_answers (
  id text PRIMARY KEY,
  attempt_id text NOT NULL,
  user_id text NOT NULL,
  question_id text NOT NULL,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 30),
  kind text NOT NULL CHECK (kind IN ('written', 'oral')),
  hadith_number integer NOT NULL CHECK (hadith_number BETWEEN 1 AND 42),
  prompt text NOT NULL,
  reference_text text NOT NULL,
  written_answer text,
  answer_sequence integer NOT NULL DEFAULT 0,
  last_mutation_id text,
  audio_sequence integer NOT NULL DEFAULT 0,
  pending_audio_sequence integer,
  expected_size_bytes integer,
  expected_content_type text,
  actual_duration_seconds real,
  storage_path text,
  upload_expires_at timestamptz,
  audio_available boolean NOT NULL DEFAULT false,
  audio_deleted_at timestamptz,
  audio_delete_pending boolean NOT NULL DEFAULT false,
  audio_expires_at timestamptz,
  verified_transcript text,
  technical_issue text,
  score integer CHECK (score IS NULL OR score IN (0, 1)),
  differences jsonb,
  provenance text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mateen_assessment_answers_audio_size
    CHECK (expected_size_bytes IS NULL OR expected_size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT mateen_assessment_answers_audio_duration
    CHECK (actual_duration_seconds IS NULL OR actual_duration_seconds BETWEEN 0 AND 60),
  UNIQUE (attempt_id, question_id),
  UNIQUE (attempt_id, position)
);
CREATE INDEX mateen_assessment_answers_review_queue ON mateen_assessment_answers(status, created_at);
CREATE INDEX mateen_assessment_answers_retention ON mateen_assessment_answers(audio_expires_at);

CREATE TABLE mateen_assessment_audit_events (
  id text PRIMARY KEY,
  attempt_id text NOT NULL,
  actor_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mateen_assessment_audit_attempt_time ON mateen_assessment_audit_events(attempt_id, created_at);

CREATE FUNCTION mateen_reject_assessment_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Assessment audit events are immutable';
END;
$$;
CREATE TRIGGER mateen_assessment_audit_immutable
  BEFORE UPDATE OR DELETE ON mateen_assessment_audit_events
  FOR EACH ROW EXECUTE FUNCTION mateen_reject_assessment_audit_mutation();

CREATE FUNCTION mateen_guard_assessment_transcript_immutables() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'scored'
     AND ROW(NEW.verified_transcript, NEW.score, NEW.differences, NEW.provenance, NEW.reviewed_by, NEW.reviewed_at)
       IS DISTINCT FROM
     ROW(OLD.verified_transcript, OLD.score, OLD.differences, OLD.provenance, OLD.reviewed_by, OLD.reviewed_at) THEN
    RAISE EXCEPTION 'A human-adjudicated assessment transcript and score are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mateen_assessment_transcript_immutables
  BEFORE UPDATE ON mateen_assessment_answers
  FOR EACH ROW EXECUTE FUNCTION mateen_guard_assessment_transcript_immutables();

CREATE TABLE mateen_assessment_reviewer_grants (
  clerk_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  changed_at timestamptz NOT NULL DEFAULT now(),
  operator_label text NOT NULL
);

CREATE TABLE mateen_scheduled_reviews (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  text_id text NOT NULL DEFAULT 'nawawi',
  hadith_number integer NOT NULL CHECK (hadith_number BETWEEN 1 AND 42),
  source_attempt_id text,
  source_question_id text,
  source_mistake text,
  interval_days integer NOT NULL DEFAULT 1 CHECK (interval_days IN (1, 3, 7, 14, 30)),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  last_mutation_id text,
  last_response jsonb,
  last_correct boolean,
  last_answer text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, hadith_number)
);
CREATE INDEX mateen_scheduled_reviews_due ON mateen_scheduled_reviews(user_id, due_at);