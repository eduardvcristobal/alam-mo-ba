package com.alammoba.api;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminOperationsValidationTest {
    @Test void curriculumRequiresBilingualTextAndValidGrade(){
        assertThatNoException().isThrownBy(()->AdminOperationsController.validateTopic(
            new AdminOperationsController.TopicDraft("Science",7,"Earth science","Agham ng Daigdig")));
        assertThatThrownBy(()->AdminOperationsController.validateTopic(
            new AdminOperationsController.TopicDraft("Science",18,"Earth science","Agham ng Daigdig")))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->AdminOperationsController.validateTopic(
            new AdminOperationsController.TopicDraft("Science",7,"","Filipino")))
            .isInstanceOf(ResponseStatusException.class);
    }
    @Test void noSecuritySettingsAreExposedThroughTheCms(){
        assertThatNoException().isThrownBy(()->AdminOperationsController.validateSetting(
            "daily_challenge_enabled",new AdminOperationsController.SettingInput("false")));
        assertThatThrownBy(()->AdminOperationsController.validateSetting(
            "admin_role",new AdminOperationsController.SettingInput("SUPER_ADMIN")))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->AdminOperationsController.validateSetting(
            "daily_challenge_enabled",new AdminOperationsController.SettingInput("yes")))
            .isInstanceOf(ResponseStatusException.class);
    }
}
