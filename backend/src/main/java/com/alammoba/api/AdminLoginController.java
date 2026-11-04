package com.alammoba.api;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin-only Google handshake: NEVER creates or upgrades a learner account.
 * An existing verified Google identity AND a separately provisioned admin role
 * are mandatory. Disabled by default until trusted deployment configuration.
 */
@RestController
@RequestMapping("/api/v1/admin/auth")
public class AdminLoginController {
    private final JdbcTemplate jdbc;
    private final GoogleIdentityVerifier verifier;
    private final boolean enabled;
    public AdminLoginController(JdbcTemplate jdbc,GoogleIdentityVerifier verifier,
        @Value("${app.admin.google-login-enabled:false}") boolean enabled){
        this.jdbc=jdbc;this.verifier=verifier;this.enabled=enabled;
    }
    public record Challenge(String nonce,Instant expiresAt){}
    public record Login(String idToken,String nonce){}
    public record Session(String token,UUID accountId,Instant expiresAt){}

    @PostMapping("/challenge")
    public ResponseEntity<Challenge> challenge(HttpServletRequest request){
        throttle(request,"challenge",10);
        requireEnabled();
        String nonce=AccountIdentityController.randomToken();
        Instant expiry=Instant.now().plus(5,ChronoUnit.MINUTES);
        jdbc.update("INSERT INTO learning_login_challenge(id,nonce_sha256,expires_at) VALUES (?,?,?)",
            UUID.randomUUID(),AccountIdentityController.digest(nonce),java.sql.Timestamp.from(expiry));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Challenge(nonce,expiry));
    }
    @Transactional
    @PostMapping("/google")
    public ResponseEntity<Session> login(HttpServletRequest request,@RequestBody Login input){
        throttle(request,"google",10);
        requireEnabled();
        if(input==null||input.nonce()==null||!input.nonce().matches("[A-Za-z0-9_-]{43}"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid admin nonce");
        String subject=verifier.verifySubject(input.idToken(),input.nonce());
        int consumed=jdbc.update("""
            UPDATE learning_login_challenge SET consumed_at=NOW()
            WHERE nonce_sha256=? AND consumed_at IS NULL AND expires_at>NOW()
            """,AccountIdentityController.digest(input.nonce()));
        if(consumed!=1)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Challenge expired or replayed");
        var ids=jdbc.query("""
            SELECT i.account_id FROM learning_account_identity i
            JOIN learning_account a ON a.id=i.account_id AND a.status='ACTIVE'
            WHERE i.provider='GOOGLE' AND i.provider_subject=?
              AND EXISTS(SELECT 1 FROM platform_admin_role r WHERE r.account_id=i.account_id)
            """,(rs,i)->rs.getObject(1,UUID.class),subject);
        if(ids.size()!=1)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"No provisioned admin account");
        UUID actor=ids.get(0);
        String bearer=AccountIdentityController.randomToken();
        Instant expiry=Instant.now().plus(8,ChronoUnit.HOURS);
        jdbc.update("""
            INSERT INTO learning_account_session(id,account_id,token_sha256,expires_at)
            VALUES (?,?,?,?)
            """,UUID.randomUUID(),actor,AccountIdentityController.digest(bearer),
                java.sql.Timestamp.from(expiry));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Session(bearer,actor,expiry));
    }
    private void requireEnabled(){
        if(!enabled)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Admin Google login disabled pending controlled provisioning");
    }
    private void throttle(HttpServletRequest request,String action,int max){
        String ip=request.getRemoteAddr()==null?"unknown":request.getRemoteAddr();
        String key=AccountIdentityController.digest("admin:"+action+":"+ip);
        long minute=Instant.now().getEpochSecond()/60;
        Integer count=jdbc.queryForObject("""
            INSERT INTO admin_login_rate_bucket(bucket_sha256,window_minute,requests)
            VALUES (?,?,1)
            ON CONFLICT(bucket_sha256,window_minute)
            DO UPDATE SET requests=admin_login_rate_bucket.requests+1
            RETURNING requests
            """,Integer.class,key,minute);
        if(count!=null&&count>max)throw new ResponseStatusException(
            HttpStatus.TOO_MANY_REQUESTS,"Admin login rate limit exceeded");
    }
}
