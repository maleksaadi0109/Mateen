-- Preserve existing scores and passes while allowing strictly-above-90
-- results (such as 90.1) to survive reloads without being rounded to 90.
ALTER TABLE mateen_learning_stages
  ALTER COLUMN best_percent TYPE double precision
  USING best_percent::double precision;