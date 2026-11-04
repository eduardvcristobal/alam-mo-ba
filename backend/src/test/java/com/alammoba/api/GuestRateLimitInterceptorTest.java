package com.alammoba.api;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import static org.assertj.core.api.Assertions.assertThat;

class GuestRateLimitInterceptorTest {
    private GuestRateLimitInterceptor interceptor(){
        return new GuestRateLimitInterceptor(new FixedWindowRateLimiter(60,20),2,2);
    }

    @Test void limitsSessionCreationAndReturnsRetryAfter() throws Exception {
        var limiter=interceptor();
        var request=request("POST","/api/v1/guest/sessions","203.0.113.10");
        var response=new MockHttpServletResponse();
        assertThat(limiter.preHandle(request,response,new Object())).isTrue();
        assertThat(limiter.preHandle(request,response,new Object())).isTrue();
        assertThat(limiter.preHandle(request,response,new Object())).isFalse();
        assertThat(response.getStatus()).isEqualTo(429);
        assertThat(response.getHeader("Retry-After")).isNotBlank();
        assertThat(response.getContentAsString()).contains("rate_limit_exceeded");
    }

    @Test void limitsProgressWritesByRemoteAddressAndIgnoresForwardedHeaders() throws Exception {
        var limiter=interceptor();
        var response=new MockHttpServletResponse();
        var request=request("PUT","/api/v1/guest/progress","203.0.113.11");
        request.addHeader("X-Forwarded-For","198.51.100.20");
        assertThat(limiter.preHandle(request,response,new Object())).isTrue();
        request.removeHeader("X-Forwarded-For");request.addHeader("X-Forwarded-For","198.51.100.21");
        assertThat(limiter.preHandle(request,response,new Object())).isTrue();
        assertThat(limiter.preHandle(request,response,new Object())).isFalse();
        var other=request("PUT","/api/v1/guest/progress","203.0.113.12");
        assertThat(limiter.preHandle(other,new MockHttpServletResponse(),new Object())).isTrue();
    }

    @Test void doesNotLimitReadsOrOtherRoutes() throws Exception {
        var limiter=interceptor();
        var response=new MockHttpServletResponse();
        for(int i=0;i<10;i++)assertThat(limiter.preHandle(request("GET","/api/v1/guest/progress","203.0.113.13"),response,new Object())).isTrue();
        assertThat(limiter.preHandle(request("POST","/api/v1/guest/sessions/revoke","203.0.113.13"),response,new Object())).isTrue();
    }

    private MockHttpServletRequest request(String method,String path,String address){
        var request=new MockHttpServletRequest(method,path);
        request.setRemoteAddr(address);
        return request;
    }
}
