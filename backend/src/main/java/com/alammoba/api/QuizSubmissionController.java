package com.alammoba.api;

import java.util.HashSet;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Scores submitted quiz answers on the server. The public question feed deliberately
 * never includes quiz_option.correct. No account is required to submit an attempt.
 */
@RestController
@RequestMapping("/api/v1/quiz")
public class QuizSubmissionController {
    private final JdbcTemplate jdbc;

    public QuizSubmissionController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Answer(long questionId, long optionId) {}
    public record Submission(String mode, Integer grade, String subject, List<Answer> answers) {}
    public record AnswerResult(long questionId, boolean correct, long correctOptionId, Map<String,String> explanations) {}
    public record Result(int score, int total, List<AnswerResult> answers) {}

    static void validate(Submission submission) {
        if (submission == null || submission.answers() == null ||
                submission.answers().isEmpty() || submission.answers().size() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "1 to 100 answers required");
        }
        ContentRepository.Filter.of(submission.mode(), submission.grade(), submission.subject(), 100, 0);
        Set<Long> ids = new HashSet<>();
        for (Answer answer : submission.answers()) {
            if (answer == null || answer.questionId() <= 0 || answer.optionId() <= 0 ||
                    !ids.add(answer.questionId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid or repeated question");
            }
        }
    }

    @PostMapping("/submit")
    public Result submit(@RequestBody Submission submission) {
        validate(submission);
        String audience = submission.mode().equals("student") ? "STUDENT" : "EXPLORE";
        List<AnswerResult> answers = new java.util.ArrayList<>();
        for (Answer answer : submission.answers()) {
            List<Boolean> correctness = jdbc.query("""
                SELECT selected.correct
                FROM quiz_question q
                JOIN content_fact f ON f.id=q.fact_id
                JOIN quiz_option selected ON selected.id=? AND selected.question_id=q.id
                WHERE q.id=? AND q.status='PUBLISHED'
                  AND f.status='PUBLISHED' AND f.verified_at IS NOT NULL
                  AND EXISTS (SELECT 1 FROM content_source s
                              WHERE s.fact_id=f.id AND s.checked_at IS NOT NULL)
                  AND EXISTS (SELECT 1 FROM content_fact_audience a
                              WHERE a.fact_id=f.id AND a.audience=?
                              AND (? IS NULL OR a.grade_level=?))
                  AND (? IS NULL OR f.subject_code=?)
                """, (rs, row) -> rs.getBoolean(1),
                answer.optionId(), answer.questionId(), audience, submission.grade(),
                submission.grade(), submission.subject(), submission.subject());
            if (correctness.size() != 1) {
                // Do not disclose existence of unpublished or audience-restricted questions.
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "question or option unavailable");
            }
            // Reveal the correct answer only after a valid submission.
            Long correctId = jdbc.queryForObject(
                "SELECT id FROM quiz_option WHERE question_id=? AND correct=true ORDER BY id LIMIT 1",
                Long.class, answer.questionId());
            if (correctId == null) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "question has no correct option");
            }
            Map<String,String> explanations = new LinkedHashMap<>();
            jdbc.query("SELECT locale,explanation FROM quiz_question_translation WHERE question_id=?",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> { explanations.put(rs.getString(1), rs.getString(2)); }, answer.questionId());
            answers.add(new AnswerResult(answer.questionId(), correctness.get(0), correctId, explanations));
        }
        int score = (int) answers.stream().filter(AnswerResult::correct).count();
        return new Result(score, answers.size(), answers);
    }
}
