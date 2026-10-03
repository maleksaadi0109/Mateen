ALTER TABLE mateen_assessment_answers
  ADD COLUMN frozen_reservation_path text,
  ADD COLUMN frozen_reservation_expires_at timestamptz,
  ADD COLUMN frozen_reservation_sequence integer,
  ADD CONSTRAINT mateen_assessment_answers_frozen_reservation_pair
    CHECK (
      (frozen_reservation_path IS NULL) = (frozen_reservation_expires_at IS NULL)
      AND (frozen_reservation_path IS NULL) = (frozen_reservation_sequence IS NULL)
    ),
  ADD CONSTRAINT mateen_assessment_answers_frozen_reservation_path
    CHECK (
      frozen_reservation_path IS NULL OR
      frozen_reservation_path LIKE '/objects/%/assessment-audio/frozen/%'
    ),
  ADD CONSTRAINT mateen_assessment_answers_storage_reservation_exclusive
    CHECK (storage_path IS NULL OR frozen_reservation_path IS NULL);

CREATE INDEX mateen_assessment_answers_frozen_reservation_expiry
  ON mateen_assessment_answers(frozen_reservation_expires_at)
  WHERE frozen_reservation_path IS NOT NULL;

CREATE FUNCTION mateen_guard_assessment_frozen_reservation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.frozen_reservation_path IS NOT NULL
     AND ROW(
       NEW.frozen_reservation_path,
       NEW.frozen_reservation_expires_at,
       NEW.frozen_reservation_sequence
     )
       IS DISTINCT FROM
     ROW(
       OLD.frozen_reservation_path,
       OLD.frozen_reservation_expires_at,
       OLD.frozen_reservation_sequence
     ) THEN
    IF NEW.frozen_reservation_path IS NOT NULL
       OR NOT (
         NEW.storage_path = OLD.frozen_reservation_path
         AND NEW.audio_available
         AND NEW.frozen_reservation_expires_at IS NULL
         AND NEW.frozen_reservation_sequence IS NULL
       ) THEN
      IF NEW.frozen_reservation_path IS NOT NULL
         OR OLD.frozen_reservation_expires_at > clock_timestamp() THEN
        RAISE EXCEPTION 'A frozen assessment reservation cannot be replaced or released before cleanup';
      END IF;
    END IF;
  END IF;
  IF OLD.frozen_reservation_path IS NULL
     AND NEW.frozen_reservation_path IS NOT NULL
     AND (
       NEW.storage_path IS NOT NULL
       OR NEW.audio_available
       OR NEW.upload_storage_path IS NULL
       OR NEW.frozen_reservation_expires_at <= clock_timestamp()
     ) THEN
    RAISE EXCEPTION 'A frozen assessment reservation must be durable before audio is written';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mateen_assessment_frozen_reservation_guard
  BEFORE UPDATE ON mateen_assessment_answers
  FOR EACH ROW EXECUTE FUNCTION mateen_guard_assessment_frozen_reservation();