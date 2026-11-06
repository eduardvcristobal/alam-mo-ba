-- Replace true/false starter quiz drafts with four-choice questions.
-- Distractors are other bilingual catalog facts from the same subject and,
-- when available, the same category. Existing learner-facing quiz records are
-- intentionally left unchanged; the catalog is used to seed new drafts.
UPDATE starter_content_catalog AS target
SET quiz_en = 'Which statement best describes "' || target.title || '"?',
    quiz_fil = 'Aling pahayag ang pinakamahusay na naglalarawan sa paksang "' || target.title || '"?',
    options = (
        SELECT jsonb_agg(choice ORDER BY md5(target.content_key || ':' || (choice->>'en')))
        FROM (
            SELECT jsonb_build_object(
                'en', target.fact_en,
                'fil', target.fact_fil,
                'correct', TRUE
            ) AS choice
            UNION ALL
            SELECT jsonb_build_object(
                'en', distractor.fact_en,
                'fil', distractor.fact_fil,
                'correct', FALSE
            ) AS choice
            FROM (
                SELECT unique_candidate.fact_en, unique_candidate.fact_fil
                FROM (
                    SELECT candidate.fact_en,candidate.fact_fil,
                           row_number() OVER (
                             PARTITION BY lower(btrim(candidate.fact_en))
                             ORDER BY CASE WHEN candidate.category=target.category THEN 0 ELSE 1 END,
                                      abs(candidate.grade_level-target.grade_level),
                                      md5(target.content_key || ':' || candidate.content_key)
                           ) AS duplicate_rank,
                           CASE WHEN candidate.category=target.category THEN 0 ELSE 1 END AS category_rank,
                           abs(candidate.grade_level-target.grade_level) AS grade_distance,
                           md5(target.content_key || ':' || candidate.content_key) AS stable_order
                    FROM starter_content_catalog AS candidate
                    WHERE candidate.active=TRUE
                      AND candidate.content_key<>target.content_key
                      AND candidate.subject_code=target.subject_code
                      AND lower(btrim(candidate.fact_en))<>lower(btrim(target.fact_en))
                      AND lower(btrim(candidate.fact_fil))<>lower(btrim(target.fact_fil))
                ) AS unique_candidate
                WHERE unique_candidate.duplicate_rank=1
                ORDER BY unique_candidate.category_rank,unique_candidate.grade_distance,
                         unique_candidate.stable_order
                LIMIT 3
            ) AS distractor
        ) AS choices
    )
WHERE target.active = TRUE
  AND target.quiz_en ILIKE 'true or false:%';
