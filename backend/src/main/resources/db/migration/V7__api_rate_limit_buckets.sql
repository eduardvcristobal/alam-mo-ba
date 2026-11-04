-- Short-lived per-network request counters; no raw IP addresses are stored.
-- Windows are UTC-independent absolute epochs to avoid timezone boundary drift.
CREATE TABLE api_rate_limit_bucket (
  bucket_key CHAR(64) NOT NULL,
  window_epoch BIGINT NOT NULL,
  requests INTEGER NOT NULL CHECK (requests > 0),
  PRIMARY KEY (bucket_key, window_epoch)
);
CREATE INDEX idx_rate_limit_epoch ON api_rate_limit_bucket(window_epoch);
