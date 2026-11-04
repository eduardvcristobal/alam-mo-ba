-- Track one-time account claims of anonymous guest progress. No ownership inferred from guest ID.
CREATE TABLE learning_guest_account_import (
 guest_id UUID PRIMARY KEY REFERENCES learning_guest_credential(id) ON DELETE CASCADE,
 account_id UUID NOT NULL REFERENCES learning_account(id) ON DELETE CASCADE,
 imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_guest_import_account ON learning_guest_account_import(account_id);
