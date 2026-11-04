package com.alammoba.api;

import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Fixed-window, multi-replica-safe limits for high-risk unauthenticated endpoints.
 * Uses direct socket address, not untrusted X-Forwarded-For headers.
 */
@Component
public class AuthRateLimiter {
    private final JdbcTemplate jdbc;
    public AuthRateLimiter(JdbcTemplate jdbc) {this.jdbc=jdbc;}

    public void enforce(HttpServletRequest request,String action,int maxPerMinute) {
        if(maxPerMinute<1)throw new IllegalArgumentException("Limit must be positive");
        String address=request.getRemoteAddr();
        String key=hash(action+":"+(address==null?"unknown":address));
        long epoch=System.currentTimeMillis()/60_000L;
        Integer count=jdbc.queryForObject("""
            INSERT INTO api_rate_limit_bucket(bucket_key,window_epoch,requests)
            VALUES (?,?,1)
            ON CONFLICT(bucket_key,window_epoch)
            DO UPDATE SET requests=api_rate_limit_bucket.requests+1
            RETURNING requests
            """, Integer.class,key,epoch);
        if(count!=null && count>maxPerMinute)
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Too many requests. Try again after this rate-limit window");
    }
    static String hash(String key) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8)));
        } catch(Exception error){throw new IllegalStateException(error);}
    }
}
