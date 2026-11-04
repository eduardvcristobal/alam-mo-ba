package com.alammoba.api;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class FixedWindowRateLimiterTest {
    @Test void limitsEachKeyAndResetsAtWindowBoundary(){
        var limiter=new FixedWindowRateLimiter(60,10);
        assertThat(limiter.check("a",2,1_000)).isEqualTo(new FixedWindowRateLimiter.Decision(true,0));
        assertThat(limiter.check("a",2,2_000).allowed()).isTrue();
        var limited=limiter.check("a",2,3_000);
        assertThat(limited.allowed()).isFalse();
        assertThat(limited.retryAfterSeconds()).isEqualTo(57);
        assertThat(limiter.check("b",2,3_000).allowed()).isTrue();
        assertThat(limiter.check("a",2,60_000).allowed()).isTrue();
    }

    @Test void failsClosedAtTheBoundedKeyCapacity(){
        var limiter=new FixedWindowRateLimiter(60,1);
        assertThat(limiter.check("a",5,1_000).allowed()).isTrue();
        assertThat(limiter.check("b",5,2_000).allowed()).isFalse();
        assertThat(limiter.check("b",5,60_000).allowed()).isTrue();
    }
}
