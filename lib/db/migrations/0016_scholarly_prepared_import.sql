-- Nullable provenance preserves existing manually entered sources/passages.
ALTER TABLE mateen_scholarly_sources ADD COLUMN IF NOT EXISTS import_key text;
ALTER TABLE mateen_scholarly_sources ADD COLUMN IF NOT EXISTS preparation_metadata jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS mateen_scholarly_sources_import_key_unique
  ON mateen_scholarly_sources (import_key);
ALTER TABLE mateen_scholarly_passages ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE mateen_scholarly_passages ADD COLUMN IF NOT EXISTS viewer_page integer;
ALTER TABLE mateen_scholarly_passages ADD COLUMN IF NOT EXISTS preparation_metadata jsonb;
