-- Isolated CI-only fixtures. No real educational content is published by this script.
INSERT INTO content_fact (canonical_key,subject_code,emoji,status,verified_at)
VALUES ('ci-verified-water','Science','💧','PUBLISHED',now()),
       ('ci-unverified-water','Science','💧','PUBLISHED',NULL),
       ('ci-draft-water','Science','💧','DRAFT',now());
INSERT INTO content_source (fact_id,source_url,source_title,checked_at)
SELECT id,'https://example.org/ci-fixture','CI synthetic content only',now()
FROM content_fact WHERE canonical_key='ci-verified-water';
INSERT INTO content_fact_translation (fact_id,locale,body)
SELECT id,'en','CI test water fact' FROM content_fact WHERE canonical_key='ci-verified-water';
INSERT INTO content_fact_translation (fact_id,locale,body)
SELECT id,'fil','CI test na kaalaman sa tubig' FROM content_fact WHERE canonical_key='ci-verified-water';
INSERT INTO content_fact_audience (fact_id,audience,grade_level)
SELECT id,'EXPLORE',NULL FROM content_fact WHERE canonical_key='ci-verified-water';
INSERT INTO content_fact_audience (fact_id,audience,grade_level)
SELECT id,'STUDENT',7 FROM content_fact WHERE canonical_key='ci-verified-water';
INSERT INTO quiz_question (fact_id,status)
SELECT id,'PUBLISHED' FROM content_fact WHERE canonical_key='ci-verified-water';
INSERT INTO quiz_question_translation (question_id,locale,prompt,explanation)
SELECT q.id,'en','CI test: Choose the correct choice','CI explanation for correct answer'
FROM quiz_question q JOIN content_fact f ON f.id=q.fact_id WHERE f.canonical_key='ci-verified-water';
INSERT INTO quiz_question_translation (question_id,locale,prompt,explanation)
SELECT q.id,'fil','CI: Piliin ang tamang sagot','CI paliwanag para sa tamang sagot'
FROM quiz_question q JOIN content_fact f ON f.id=q.fact_id WHERE f.canonical_key='ci-verified-water';
INSERT INTO quiz_option (question_id,position,correct)
SELECT q.id,0,true FROM quiz_question q JOIN content_fact f ON f.id=q.fact_id WHERE f.canonical_key='ci-verified-water';
INSERT INTO quiz_option (question_id,position,correct)
SELECT q.id,1,false FROM quiz_question q JOIN content_fact f ON f.id=q.fact_id WHERE f.canonical_key='ci-verified-water';
INSERT INTO quiz_option_translation(option_id,locale,body)
SELECT o.id,'en',CASE WHEN o.correct THEN 'correct' ELSE 'incorrect' END
FROM quiz_option o JOIN quiz_question q ON q.id=o.question_id JOIN content_fact f ON f.id=q.fact_id
WHERE f.canonical_key='ci-verified-water';
