package com.alammoba.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GuestProgressControllerTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    @Test void acceptsValidGuestState() throws Exception {
        String body = """
            {"mode":"student","lang":"fil","grade":"7","subject":"all",
             "count":5,"saved":[1,-4],"learned":[3],"streak":2,"last":"2026-11-04","attempts":[]}
            """;
        assertThat(GuestProgressController.validateState(JSON.readTree(body))).contains("student");
    }
    @Test void rejectsMalformedCollections() throws Exception {
        for (String body : new String[]{
            "{}", "{\"saved\":{},\"learned\":[],\"attempts\":[]}",
            "{\"saved\":[\"1\"],\"learned\":[],\"attempts\":[]}",
            "{\"saved\":[],\"learned\":[],\"attempts\":{},\"count\":5}"
        }) {
            assertThatThrownBy(() -> GuestProgressController.validateState(JSON.readTree(body)))
                .isInstanceOf(ResponseStatusException.class);
        }
    }
    @Test void rejectsUnexpectedDataAndOutOfRangeCount() throws Exception {
        for (String body : new String[]{
            "{\"saved\":[],\"learned\":[],\"attempts\":[],\"admin\":true}",
            "{\"saved\":[],\"learned\":[],\"attempts\":[],\"count\":101}",
            "{\"saved\":[],\"learned\":[],\"attempts\":[],\"mode\":\"admin\"}",
            "{\"saved\":[],\"learned\":[],\"attempts\":[],\"lang\":\"xx\"}"
        }) {
            assertThatThrownBy(() -> GuestProgressController.validateState(JSON.readTree(body)))
                .isInstanceOf(ResponseStatusException.class);
        }
    }
}
