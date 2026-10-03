ALTER TABLE mateen_assessment_answers
  ADD COLUMN frozen_reservation_cleanup_pending boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT mateen_assessment_answers_frozen_reservation_cleanup_state
    CHECK (frozen_reservation_path IS NOT NULL OR frozen_reservation_cleanup_pending = false);

CREATE OR REPLACE FUNCTION mateen_guard_assessment_frozen_reservation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.frozen_reservation_path IS NOT NULL THEN
    IF ROW(
      NEW.frozen_reservation_path,
      NEW.frozen_reservation_expires_at,
      NEW.frozen_reservation_sequence
    ) IS DISTINCT FROM ROW(
      OLD.frozen_reservation_path,
      OLD.frozen_reservation_expires_at,
      OLD.frozen_reservation_sequence
    ) THEN
      IF NOT (
        NOT OLD.frozen_reservation_cleanup_pending
        AND NEW.storage_path = OLD.frozen_reservation_path
        AND NEW.audio_available
        AND NEW.frozen_reservation_path IS NULL
        AND NEW.frozen_reservation_expires_at IS NULL
        AND NEW.frozen_reservation_sequence IS NULL
        AND NOT NEW.frozen_reservation_cleanup_pending
      ) AND NOT (
        NEW.frozen_reservation_path IS NULL
        AND OLD.frozen_reservation_expires_at <= clock_timestamp()
        AND NOT NEW.frozen_reservation_cleanup_pending
      ) THEN
        RAISE EXCEPTION 'A frozen assessment reservation cannot be replaced or released before cleanup';
      END IF;
    END IF;

    IF OLD.frozen_reservation_cleanup_pending IS DISTINCT FROM NEW.frozen_reservation_cleanup_pending
       AND NOT (
         NOT OLD.frozen_reservation_cleanup_pending
         AND NEW.frozen_reservation_cleanup_pending
         AND OLD.frozen_reservation_expires_at <= clock_timestamp()
       )
       AND NOT (
         OLD.frozen_reservation_cleanup_pending
         AND NOT NEW.frozen_reservation_cleanup_pending
         AND NEW.frozen_reservation_path IS NULL
         AND OLD.frozen_reservation_expires_at <= clock_timestamp()
       ) THEN
      RAISE EXCEPTION 'Frozen assessment reservation cleanup state is fenced';
    END IF;
  END IF;

  IF OLD.frozen_reservation_path IS NULL
     AND NEW.frozen_reservation_path IS NOT NULL
     AND (
       NEW.storage_path IS NOT NULL
       OR NEW.audio_available
       OR NEW.upload_storage_path IS NULL
       OR NEW.frozen_reservation_expires_at <= clock_timestamp()
       OR NEW.frozen_reservation_cleanup_pending
     ) THEN
    RAISE EXCEPTION 'A frozen assessment reservation must be durable before audio is written';
  END IF;
  RETURN NEW;
END;
$$;