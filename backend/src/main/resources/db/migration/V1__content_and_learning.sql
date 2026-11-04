-- M1.1 content schema; no sample facts are published without verification.
CREATE TABLE content_fact (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 canonical_key VARCHAR(128) NOT NULL UNIQUE,
 subject_code VARCHAR(40) NOT NULL,
 emoji VARCHAR(24),
 status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','IN_REVIEW','PUBLISHED','RETIRED')),
 verified_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE content_fact_translation (
 fact_id BIGINT NOT NULL REFERENCES content_fact(id) ON DELETE CASCADE,
 locale VARCHAR(12) NOT NULL,
 body TEXT NOT NULL,
 PRIMARY KEY (fact_id,locale)
);
CREATE TABLE content_fact_audience (
 fact_id BIGINT NOT NULL REFERENCES content_fact(id) ON DELETE CASCADE,
 audience VARCHAR(16) NOT NULL CHECK (audience IN ('STUDENT','EXPLORE')),
 grade_level INTEGER CHECK (grade_level BETWEEN 1 AND 12),
 PRIMARY KEY (fact_id,audience,grade_level)
);
CREATE TABLE content_source (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 fact_id BIGINT NOT NULL REFERENCES content_fact(id) ON DELETE CASCADE,
 source_url TEXT NOT NULL,
 source_title TEXT NOT NULL,
 checked_at TIMESTAMPTZ
);
CREATE TABLE quiz_question (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 fact_id BIGINT NOT NULL REFERENCES content_fact(id),
 status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE quiz_question_translation (
 question_id BIGINT NOT NULL REFERENCES quiz_question(id) ON DELETE CASCADE,
 locale VARCHAR(12) NOT NULL,
 prompt TEXT NOT NULL,
 explanation TEXT NOT NULL,
 PRIMARY KEY(question_id,locale)
);
CREATE TABLE quiz_option (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 question_id BIGINT NOT NULL REFERENCES quiz_question(id) ON DELETE CASCADE,
 position SMALLINT NOT NULL CHECK(position>=0),
 correct BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(question_id,position)
);
CREATE TABLE quiz_option_translation (
 option_id BIGINT NOT NULL REFERENCES quiz_option(id) ON DELETE CASCADE,
 locale VARCHAR(12) NOT NULL,
 body TEXT NOT NULL,
 PRIMARY KEY(option_id,locale)
);
CREATE TABLE learning_guest_session (
 id UUID PRIMARY KEY,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE quiz_attempt (
 id UUID PRIMARY KEY,
 guest_session_id UUID REFERENCES learning_guest_session(id) ON DELETE CASCADE,
 quiz_type VARCHAR(24) NOT NULL,
 total_questions INT NOT NULL CHECK(total_questions>0),
 correct_answers INT NOT NULL CHECK(correct_answers>=0 AND correct_answers<=total_questions),
 completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE quiz_attempt_answer (
 attempt_id UUID NOT NULL REFERENCES quiz_attempt(id) ON DELETE CASCADE,
 question_id BIGINT NOT NULL REFERENCES quiz_question(id),
 selected_option_id BIGINT REFERENCES quiz_option(id),
 correct BOOLEAN NOT NULL,
 PRIMARY KEY(attempt_id,question_id)
);
CREATE INDEX idx_content_fact_subject_status ON content_fact(subject_code,status);
CREATE INDEX idx_quiz_question_fact ON quiz_question(fact_id);
CREATE INDEX idx_quiz_attempt_guest ON quiz_attempt(guest_session_id,completed_at);
