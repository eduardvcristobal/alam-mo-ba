-- Weekly standings count one server-graded correct answer per account/question/day.
CREATE TABLE learning_leaderboard_correct_answer (
    account_id UUID NOT NULL REFERENCES learning_account(id) ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES quiz_question(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, question_id, activity_date)
);

CREATE INDEX idx_leaderboard_week_points
    ON learning_leaderboard_correct_answer(activity_date, account_id);
