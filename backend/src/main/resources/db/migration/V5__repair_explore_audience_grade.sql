-- V1 schema compatibility repair: original V1__content_and_learning.sql used
-- PRIMARY KEY(fact_id,audience,grade_level), implicitly forcing a grade for EXPLORE.
-- Preserve existing V1 checksums in deployed databases; repair forward-only.
ALTER TABLE content_fact_audience
  DROP CONSTRAINT IF EXISTS content_fact_audience_pkey;
ALTER TABLE content_fact_audience
  ALTER COLUMN grade_level DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fact_audience_grade
  ON content_fact_audience(fact_id,audience,COALESCE(grade_level,0));
ALTER TABLE content_fact_audience
  ADD CONSTRAINT ck_fact_audience_grade
  CHECK ((audience='STUDENT' AND grade_level IS NOT NULL)
      OR (audience='EXPLORE' AND grade_level IS NULL));
