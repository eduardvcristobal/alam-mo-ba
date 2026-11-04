-- M1.2.5 OIDC login nonce and revocable registered-account bearer sessions.
CREATE TABLE learning_login_challenge (
 id UUID PRIMARY KEY,
 nonce_sha256 CHAR(64) NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ,
 CHECK (expires_at > created_at)
);
CREATE INDEX idx_login_challenge_expiration ON learning_login_challenge(expires_at);

CREATE TABLE learning_account_session (
 id UUID PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES learning_account(id) ON DELETE CASCADE,
 token_sha256 CHAR(64) NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 CHECK (expires_at > created_at)
);
CREATE INDEX idx_account_session_account ON learning_account_session(account_id);
CREATE INDEX idx_account_session_expiration ON learning_account_session(expires_at);
