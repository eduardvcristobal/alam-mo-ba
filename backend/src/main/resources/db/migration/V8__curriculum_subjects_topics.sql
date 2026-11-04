-- M1.3.6 curriculum taxonomy. Preserve existing facts without forcing an unsafe data rewrite.
CREATE TABLE curriculum_subject (
 code VARCHAR(40) PRIMARY KEY,
 name_en VARCHAR(120) NOT NULL,
 name_fil VARCHAR(120) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 display_order INTEGER NOT NULL DEFAULT 0
);
INSERT INTO curriculum_subject(code,name_en,name_fil,display_order) VALUES
 ('Science','Science','Agham',10),
 ('AP','Araling Panlipunan','Araling Panlipunan',20),
 ('MAPEH','MAPEH','MAPEH',30),
 ('Filipino','Filipino','Filipino',40),
 ('Math','Mathematics','Matematika',50),
 ('TLE','Technology and Livelihood Education','Edukasyong Pantahanan at Pangkabuhayan',60);
CREATE TABLE curriculum_topic (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 subject_code VARCHAR(40) NOT NULL REFERENCES curriculum_subject(code),
 grade_level INTEGER NOT NULL CHECK(grade_level BETWEEN 1 AND 12),
 name_en VARCHAR(200) NOT NULL,
 name_fil VARCHAR(200) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(subject_code,grade_level,name_en)
);
ALTER TABLE content_fact ADD COLUMN topic_id BIGINT REFERENCES curriculum_topic(id);
CREATE INDEX idx_fact_topic ON content_fact(topic_id);
CREATE INDEX idx_topic_subject_grade ON curriculum_topic(subject_code,grade_level,active);
