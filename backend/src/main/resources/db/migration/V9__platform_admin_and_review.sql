-- M1.3 platform administration. No admins are created automatically.
CREATE TABLE platform_admin_role (
 account_id UUID NOT NULL REFERENCES learning_account(id) ON DELETE CASCADE,
 role VARCHAR(32) NOT NULL CHECK(role IN ('SUPER_ADMIN','CONTENT_ADMIN','EDITOR','REVIEWER','SUPPORT')),
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,role)
);
CREATE TABLE platform_admin_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id UUID NOT NULL,
 action VARCHAR(64) NOT NULL,
 entity_type VARCHAR(32) NOT NULL,
 entity_id BIGINT,
 detail TEXT NOT NULL DEFAULT '',
 at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_admin_audit_date ON platform_admin_audit(at DESC);
ALTER TABLE content_fact ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE content_fact ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE content_fact ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE content_fact ADD COLUMN IF NOT EXISTS published_by UUID;
ALTER TABLE content_fact ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE quiz_question ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE quiz_question ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE quiz_question ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE quiz_question ADD COLUMN IF NOT EXISTS published_by UUID;
ALTER TABLE quiz_question ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE quiz_question ADD CONSTRAINT ck_quiz_review_status CHECK(status IN('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED'));
ALTER TABLE content_fact DROP CONSTRAINT IF EXISTS content_fact_status_check;
ALTER TABLE content_fact ADD CONSTRAINT ck_fact_review_status CHECK(status IN('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED'));
