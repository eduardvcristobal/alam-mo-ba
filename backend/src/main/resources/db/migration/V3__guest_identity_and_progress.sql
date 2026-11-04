-- M1.2 account + anonymous cloud-backup foundation.
-- Account creation/sign-in is intentionally unavailable until provider token verification is implemented.
CREATE TABLE learning_account (
 id UUID PRIMARY KEY,
 status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
   CHECK (status IN ('ACTIVE','DISABLED','DELETED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 deleted_at TIMESTAMPTZ,
 CONSTRAINT account_deleted_consistent CHECK (status <> 'DELETED' OR deleted_at IS NOT NULL)
);
CREATE TABLE learning_account_identity (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES learning_account(id) ON DELETE CASCADE,
 provider VARCHAR(32) NOT NULL CHECK (provider IN ('GOOGLE','EMAIL')),
 provider_subject VARCHAR(255) NOT NULL,
 verified_at TIMESTAMPTZ NOT NULL,
 UNIQUE (provider, provider_subject)
);
CREATE INDEX idx_learning_identity_account ON learning_account_identity(account_id);

-- Only SHA-256 hashes are stored; raw device bearer tokens are never persisted.
-- These tokens grant access exclusively to the corresponding anonymous guest's progress.
CREATE TABLE learning_guest_credential (
 id UUID PRIMARY KEY,
 token_sha256 CHAR(64) NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 CONSTRAINT guest_expiry CHECK (expires_at > created_at)
);
CREATE INDEX idx_guest_expiry ON learning_guest_credential(expires_at);

CREATE TABLE learning_guest_progress (
 guest_id UUID PRIMARY KEY REFERENCES learning_guest_credential(id) ON DELETE CASCADE,
 state JSONB NOT NULL DEFAULT '{}'::jsonb,
 version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE learning_account_progress (
 account_id UUID PRIMARY KEY REFERENCES learning_account(id) ON DELETE CASCADE,
 state JSONB NOT NULL DEFAULT '{}'::jsonb,
 version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
