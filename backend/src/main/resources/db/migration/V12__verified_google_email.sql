-- Store only the email Google has verified in the signed ID token.
-- The value is exposed only by the SUPER_ADMIN role-management endpoint.
ALTER TABLE learning_account_identity
  ADD COLUMN IF NOT EXISTS verified_email VARCHAR(320);
