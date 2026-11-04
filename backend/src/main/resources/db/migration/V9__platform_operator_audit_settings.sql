-- M1.3.7-9 privileged learner operations and auditable platform configuration.
CREATE TABLE platform_operator_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id UUID NOT NULL REFERENCES learning_account(id),
 action VARCHAR(60) NOT NULL,
 target_type VARCHAR(24) NOT NULL,
 target_id VARCHAR(128) NOT NULL,
 details VARCHAR(1000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_platform_operator_audit_recent ON platform_operator_audit(created_at DESC);
CREATE TABLE platform_setting (
 setting_key VARCHAR(64) PRIMARY KEY,
 setting_value BOOLEAN NOT NULL,
 updated_by UUID REFERENCES learning_account(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO platform_setting(setting_key,setting_value) VALUES
 ('content_submissions_enabled',TRUE);
