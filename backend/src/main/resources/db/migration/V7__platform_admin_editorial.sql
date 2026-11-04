-- M1.3: Privileged operator roles and editorial audit trail.
-- No default admin account and no public role-assignment endpoint.
CREATE TABLE platform_admin_role (
 account_id UUID NOT NULL REFERENCES learning_account(id) ON DELETE CASCADE,
 role VARCHAR(24) NOT NULL CHECK(role IN ('SUPER_ADMIN','CONTENT_ADMIN','EDITOR','REVIEWER','SUPPORT')),
 granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(account_id,role)
);
CREATE TABLE editorial_event (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 entity_type VARCHAR(16) NOT NULL CHECK(entity_type IN ('FACT','QUIZ')),
 entity_id BIGINT NOT NULL,
 action VARCHAR(32) NOT NULL,
 actor_id UUID NOT NULL REFERENCES learning_account(id),
 from_status VARCHAR(24),
 to_status VARCHAR(24),
 details TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_editorial_event_entity ON editorial_event(entity_type,entity_id,created_at DESC);
ALTER TABLE content_fact ADD COLUMN created_by UUID REFERENCES learning_account(id);
ALTER TABLE content_fact ADD COLUMN last_reviewed_by UUID REFERENCES learning_account(id);
ALTER TABLE quiz_question ADD COLUMN created_by UUID REFERENCES learning_account(id);
ALTER TABLE quiz_question ADD COLUMN last_reviewed_by UUID REFERENCES learning_account(id);
ALTER TABLE quiz_question ADD CONSTRAINT ck_quiz_status
  CHECK(status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED'));
-- The original content_fact.status check does not admit APPROVED. Replace forward-only.
ALTER TABLE content_fact DROP CONSTRAINT IF EXISTS content_fact_status_check;
ALTER TABLE content_fact ADD CONSTRAINT ck_fact_status
  CHECK(status IN ('DRAFT','IN_REVIEW','APPROVED','PUBLISHED','RETIRED'));
