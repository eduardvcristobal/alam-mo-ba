package com.alammoba.api;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class AuthRateLimiterTest {
    @Test void rejectsAfterWindowIsExhausted() {
        JdbcTemplate db=mock(JdbcTemplate.class);
        HttpServletRequest request=mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("192.0.2.3");
        when(db.queryForObject(anyString(),eq(Integer.class),any(Object[].class)))
            .thenReturn(1,2,3);
        var limiter=new AuthRateLimiter(db);
        limiter.enforce(request,"google-login",2);
        limiter.enforce(request,"google-login",2);
        assertThatThrownBy(()->limiter.enforce(request,"google-login",2))
            .isInstanceOf(ResponseStatusException.class)
            .satisfies(ex->assertThat(((ResponseStatusException)ex).getStatusCode())
                .isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
        verify(db,times(3)).queryForObject(anyString(),eq(Integer.class),any(Object[].class));
    }
    @Test void hashesDistinctActionsWithoutStoringRawAddresses() {
        String a=AuthRateLimiter.hash("guest-create:192.0.2.3");
        String b=AuthRateLimiter.hash("google-login:192.0.2.3");
        assertThat(a).hasSize(64).isNotEqualTo(b).doesNotContain("192.0.2.3");
    }
}
