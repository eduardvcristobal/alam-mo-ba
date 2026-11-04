package com.alammoba.api;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class PlatformCurriculumValidationTest {
    @Test void validBilingualSubjectAndTopicAreAccepted(){
        assertThatNoException().isThrownBy(()->PlatformCurriculumController.checkSubject(
            new PlatformCurriculumController.SubjectInput("Science","Science","Agham",true,10)));
        assertThatNoException().isThrownBy(()->PlatformCurriculumController.checkTopic(
            new PlatformCurriculumController.TopicInput("Science",7,"States of Matter","Estado ng Materya",true)));
    }
    @Test void rejectsInvalidSubjectCodesAndGrades(){
        assertThatThrownBy(()->PlatformCurriculumController.checkSubject(
            new PlatformCurriculumController.SubjectInput("science;DROP","Science","Agham",true,10)))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->PlatformCurriculumController.checkTopic(
            new PlatformCurriculumController.TopicInput("Science",13,"Topic","Paksa",true)))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->PlatformCurriculumController.checkTopic(
            new PlatformCurriculumController.TopicInput("Science",7,"Topic","",true)))
            .isInstanceOf(ResponseStatusException.class);
    }
}
