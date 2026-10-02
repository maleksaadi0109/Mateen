import { pool } from "@workspace/db";

// Additive protection only; does not grant roles or alter existing user data.
try {
  await pool.query(`
    CREATE OR REPLACE FUNCTION mateen_review_audit_immutable()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Review audit history is append-only';
    END;
    $$;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'mateen_review_audit_immutable_trigger') THEN
        CREATE TRIGGER mateen_review_audit_immutable_trigger
        BEFORE UPDATE OR DELETE ON mateen_review_audit
        FOR EACH ROW EXECUTE FUNCTION mateen_review_audit_immutable();
      END IF;
    END;
    $$;
  `);
} finally {
  await pool.end();
}