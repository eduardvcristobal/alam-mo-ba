-- Topic mapping is optional; only draft facts may be reclassified without review.
CREATE TABLE platform_fact_topic(
 fact_id BIGINT PRIMARY KEY REFERENCES content_fact(id) ON DELETE CASCADE,
 topic_id BIGINT NOT NULL REFERENCES platform_topic(id)
);
CREATE INDEX idx_platform_fact_topic_topic ON platform_fact_topic(topic_id);
