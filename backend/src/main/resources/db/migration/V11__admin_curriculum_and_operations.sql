-- M1.3.6–M1.3.9 controlled curriculum and admin operations.
CREATE TABLE platform_subject (
 code VARCHAR(40) PRIMARY KEY,
 display_name VARCHAR(100) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO platform_subject(code,display_name) VALUES
 ('Science','Science'),('AP','Araling Panlipunan'),('MAPEH','MAPEH'),
 ('Filipino','Filipino'),('Math','Mathematics'),('TLE','Technology and Livelihood Education')
ON CONFLICT(code) DO NOTHING;

CREATE TABLE platform_topic (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 subject_code VARCHAR(40) NOT NULL REFERENCES platform_subject(code),
 grade_level INTEGER NOT NULL CHECK(grade_level BETWEEN 1 AND 12),
 title_en VARCHAR(180) NOT NULL,
 title_fil VARCHAR(180) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT true,
 UNIQUE(subject_code,grade_level,title_en)
);
CREATE INDEX idx_platform_topic_subject_grade ON platform_topic(subject_code,grade_level);

CREATE TABLE platform_setting (
 setting_key VARCHAR(50) PRIMARY KEY,
 setting_value VARCHAR(255) NOT NULL,
 updated_by UUID,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(setting_key IN ('daily_challenge_enabled','maintenance_notice'))
);
INSERT INTO platform_setting(setting_key,setting_value) VALUES
 ('daily_challenge_enabled','true'),('maintenance_notice','')
ON CONFLICT(setting_key) DO NOTHING;

CREATE TABLE learning_privacy_request (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES learning_account(id) ON DELETE CASCADE,
 request_type VARCHAR(20) NOT NULL CHECK(request_type IN ('EXPORT','DELETE')),
 status VARCHAR(24) NOT NULL DEFAULT 'OPEN'
   CHECK(status IN ('OPEN','IN_REVIEW','CLOSED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by UUID,
 reviewed_at TIMESTAMPTZ
);
CREATE INDEX idx_privacy_request_status ON learning_privacy_request(status,created_at DESC);
