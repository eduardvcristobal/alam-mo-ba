-- Explicit rate limits for the admin-only OAuth handshake, safe across replicas.
CREATE TABLE admin_login_rate_bucket(
 bucket_sha256 CHAR(64) NOT NULL,
 window_minute BIGINT NOT NULL,
 requests INTEGER NOT NULL CHECK(requests>0),
 PRIMARY KEY(bucket_sha256,window_minute)
);
CREATE INDEX idx_admin_login_rate_expiry ON admin_login_rate_bucket(window_minute);
