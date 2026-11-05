package com.alammoba.api;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class AdminBootstrapEmailTest {
    @Test void matchesConfiguredVerifiedEmailCaseInsensitively() {
        assertThat(AdminLoginController.isBootstrapEmail(
            "EduardValdezCristobal@gmail.com", "eduardvaldezcristobal@gmail.com")).isTrue();
    }

    @Test void requiresAnExactNonblankEmailMatch() {
        assertThat(AdminLoginController.isBootstrapEmail("", "admin@example.org")).isFalse();
        assertThat(AdminLoginController.isBootstrapEmail(null, "admin@example.org")).isFalse();
        assertThat(AdminLoginController.isBootstrapEmail(
            "admin@example.org", "admin+other@example.org")).isFalse();
        assertThat(AdminLoginController.isBootstrapEmail(
            "admin@example.org", "admin@other.example.org")).isFalse();
    }
}
