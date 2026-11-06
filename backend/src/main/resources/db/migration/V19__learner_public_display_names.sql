CREATE TABLE learning_account_profile (
    account_id UUID PRIMARY KEY REFERENCES learning_account(id) ON DELETE CASCADE,
    display_name VARCHAR(24) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT account_profile_display_name_shape CHECK (
      length(display_name) BETWEEN 3 AND 24
      AND display_name = btrim(display_name)
      AND position('@' IN display_name) = 0
    )
);

CREATE UNIQUE INDEX uq_account_profile_display_name_ci
    ON learning_account_profile (lower(display_name));

-- Give existing accounts private, non-identifying aliases. Learners can change them in Profile.
INSERT INTO learning_account_profile(account_id, display_name)
SELECT id, 'Learner-' || upper(substr(replace(id::text, '-', ''), 1, 16))
FROM learning_account;
