package com.alammoba.api;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/** Limits anonymous guest-session creation and progress writes by server-observed client address. */
@Component
public final class GuestRateLimitInterceptor implements HandlerInterceptor {
    private static final String GUEST_PREFIX="/api/v1/guest";
    private final FixedWindowRateLimiter limiter;
    private final int sessionCreationsPerWindow;
    private final int progressWritesPerWindow;

    public GuestRateLimitInterceptor(FixedWindowRateLimiter limiter,
            @Value("${app.rate-limit.guest.session-creations-per-window:5}") int sessionCreationsPerWindow,
            @Value("${app.rate-limit.guest.progress-writes-per-window:60}") int progressWritesPerWindow) {
        if(sessionCreationsPerWindow<1 || progressWritesPerWindow<1)
            throw new IllegalArgumentException("Guest rate limits must be positive");
        this.limiter=limiter;
        this.sessionCreationsPerWindow=sessionCreationsPerWindow;
        this.progressWritesPerWindow=progressWritesPerWindow;
    }

    @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) throws IOException {
        String method=request.getMethod();
        String path=request.getRequestURI().substring(request.getContextPath().length());
        int limit;
        String action;
        if("POST".equals(method) && (GUEST_PREFIX+"/sessions").equals(path)) {
            limit=sessionCreationsPerWindow;action="guest-session";
        }else if("PUT".equals(method) && (GUEST_PREFIX+"/progress").equals(path)) {
            limit=progressWritesPerWindow;action="guest-progress-write";
        }else return true;

        // Forwarded headers are deliberately ignored. Configure a trusted proxy or edge limit in deployment.
        String client=request.getRemoteAddr();
        FixedWindowRateLimiter.Decision decision=limiter.check(action+":"+client,limit,System.currentTimeMillis());
        if(decision.allowed())return true;

        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader(HttpHeaders.RETRY_AFTER,Long.toString(decision.retryAfterSeconds()));
        response.setHeader(HttpHeaders.CACHE_CONTROL,"no-store");
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"error\":\"rate_limit_exceeded\",\"retryAfterSeconds\":"+decision.retryAfterSeconds()+"}");
        return false;
    }
}
