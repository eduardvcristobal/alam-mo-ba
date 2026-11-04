-- Indexes support the published and verified content filters used by the public API.
CREATE INDEX IF NOT EXISTS idx_content_fact_published_verified
    ON content_fact(subject_code,id)
    WHERE status='PUBLISHED' AND verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fact_audience_lookup
    ON content_fact_audience(audience,grade_level,fact_id);
CREATE INDEX IF NOT EXISTS idx_source_checked_fact
    ON content_source(fact_id)
    WHERE checked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quiz_published_fact
    ON quiz_question(fact_id,id)
    WHERE status='PUBLISHED';
CREATE INDEX IF NOT EXISTS idx_quiz_options_question
    ON quiz_option(question_id,id);
