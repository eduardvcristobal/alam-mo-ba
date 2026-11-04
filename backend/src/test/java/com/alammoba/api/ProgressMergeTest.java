package com.alammoba.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.springframework.web.server.ResponseStatusException;

class ProgressMergeTest {
    private static final ObjectMapper JSON=new ObjectMapper();
    @Test void mergesFactsAndAttemptsWithoutLosingExistingSettings() throws Exception {
        var registered=JSON.readTree("""
        {"mode":"student","lang":"en","grade":"9","subject":"Science","count":10,
         "saved":[1,2],"learned":[8],"attempts":[{"score":1,"total":2,"date":"2026-11-04"}],
         "streak":3,"last":"2026-11-04"}
        """);
        var guest=JSON.readTree("""
        {"mode":"explore","lang":"fil","grade":"7","subject":"all","count":5,
         "saved":[2,3],"learned":[8,9],
         "attempts":[{"score":1,"total":2,"date":"2026-11-04"},{"score":2,"total":2,"date":"2026-11-05"}],
         "streak":4,"last":"2026-11-05"}
        """);
        var merged=ProgressMerge.merge(registered,guest);
        assertThat(merged.path("mode").asText()).isEqualTo("student");
        assertThat(merged.path("lang").asText()).isEqualTo("en");
        assertThat(merged.path("saved").size()).isEqualTo(3);
        assertThat(merged.path("learned").size()).isEqualTo(2);
        assertThat(merged.path("attempts").size()).isEqualTo(2);
        assertThat(merged.path("streak").asInt()).isEqualTo(4);
    }
    @Test void initializesEmptyAccountFromGuest() throws Exception {
        var guest=JSON.readTree("""
        {"mode":"explore","lang":"fil","grade":"7","subject":"all","count":5,
         "saved":[1],"learned":[],"attempts":[],"streak":0,"last":""}
        """);
        var merged=ProgressMerge.merge(JSON.readTree("{}"),guest);
        assertThat(merged.path("mode").asText()).isEqualTo("explore");
        assertThat(merged.path("saved").size()).isEqualTo(1);
    }
    @Test void rejectsMalformedProgressRatherThanImportingArbitraryFields() throws Exception {
        var injected=JSON.readTree("""
        {"saved":[],"learned":[],"attempts":[],"admin":true}
        """);
        assertThatThrownBy(()->ProgressMerge.merge(JSON.readTree("{}"),injected))
            .isInstanceOf(ResponseStatusException.class);
    }
}
