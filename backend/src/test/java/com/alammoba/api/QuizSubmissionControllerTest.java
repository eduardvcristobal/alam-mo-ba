package com.alammoba.api;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuizSubmissionControllerTest {
    @Test void acceptsValidStudentAndExploreSubmissions() {
        assertThatNoException().isThrownBy(() -> QuizSubmissionController.validate(
            new QuizSubmissionController.Submission("student", 7, "Science",
                List.of(new QuizSubmissionController.Answer(11, 21)))));
        assertThatNoException().isThrownBy(() -> QuizSubmissionController.validate(
            new QuizSubmissionController.Submission("explore", null, null,
                List.of(new QuizSubmissionController.Answer(11, 21)))));
    }

    @Test void rejectsMissingAnswers() {
        assertThatThrownBy(() -> QuizSubmissionController.validate(
            new QuizSubmissionController.Submission("student", 7, null, List.of())))
            .isInstanceOf(ResponseStatusException.class);
    }

    @Test void rejectsDuplicateQuestions() {
        assertThatThrownBy(() -> QuizSubmissionController.validate(
            new QuizSubmissionController.Submission("explore", null, null,
                List.of(new QuizSubmissionController.Answer(11, 21),
                        new QuizSubmissionController.Answer(11, 22)))))
            .isInstanceOf(ResponseStatusException.class);
    }

    @Test void rejectsInvalidQuestionOrAnswerIds() {
        assertThatThrownBy(() -> QuizSubmissionController.validate(
            new QuizSubmissionController.Submission("explore", null, null,
                List.of(new QuizSubmissionController.Answer(0, 21)))))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> QuizSubmissionController.validate(
            new QuizSubmissionController.Submission("explore", null, null,
                List.of(new QuizSubmissionController.Answer(11, -1)))))
            .isInstanceOf(ResponseStatusException.class);
    }

    @Test void validatesAudienceAndGrade() {
        assertThatThrownBy(() -> QuizSubmissionController.validate(
            new QuizSubmissionController.Submission("explore", 7, null,
                List.of(new QuizSubmissionController.Answer(11, 21)))))
            .isInstanceOf(ResponseStatusException.class);
    }
}
