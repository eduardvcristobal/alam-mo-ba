package com.alammoba.api;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Locale;
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
 * Admin-only Google handshake. A single configured, verified Google email may
 * bootstrap the first SUPER_ADMIN account; other identities need a provisioned role.
 */
@RestController
@RequestMapping("/api/v1/admin/auth")
public class AdminLoginController {
    private final JdbcTemplate jdbc;
    private final GoogleIdentityVerifier verifier;
    private final boolean enabled;
    private final String bootstrapEmail;
    public AdminLoginController(JdbcTemplate jdbc,GoogleIdentityVerifier verifier,
        @Value("${app.admin.google-login-enabled:false}") boolean enabled,
        @Value("${app.admin.bootstrap-email:}") String bootstrapEmail){
        this.jdbc=jdbc;this.verifier=verifier;this.enabled=enabled;
        this.bootstrapEmail=bootstrapEmail==null?"":bootstrapEmail.trim().toLowerCase(Locale.ROOT);
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
        var identity=verifier.verifyIdentity(input.idToken(),input.nonce());
        int consumed=jdbc.update("""
            UPDATE learning_login_challenge SET consumed_at=NOW()
            WHERE nonce_sha256=? AND consumed_at IS NULL AND expires_at>NOW()
            """,AccountIdentityController.digest(input.nonce()));
        if(consumed!=1)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Challenge expired or replayed");
        jdbc.update("""
            UPDATE learning_account_identity SET verified_email=?,verified_at=NOW()
            WHERE provider='GOOGLE' AND provider_subject=?
            """,identity.email(),identity.subject());
        var accounts=jdbc.query("""
            SELECT a.id,a.status FROM learning_account_identity i
            JOIN learning_account a ON a.id=i.account_id
            WHERE i.provider='GOOGLE' AND i.provider_subject=?
            """,(rs,i)->Map.entry(rs.getObject(1,UUID.class),rs.getString(2)),identity.subject());
        UUID actor;
        if(accounts.isEmpty()) {
            if(!isBootstrapEmail(bootstrapEmail,identity.email()))
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,"No provisioned admin account");
            actor=seedSuperAdminAccount(identity);
        } else {
            if(accounts.size()!=1 || !"ACTIVE".equals(accounts.get(0).getValue()))
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,"No active admin account");
            actor=accounts.get(0).getKey();
            Integer hasRole=jdbc.queryForObject(
                "SELECT count(*) FROM platform_admin_role WHERE account_id=?",Integer.class,actor);
            if(hasRole==null||hasRole<1)
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,"No provisioned admin account");
        }
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
    static boolean isBootstrapEmail(String configured,String verified) {
        return configured!=null&&!configured.isBlank()&&verified!=null&&
            configured.trim().equalsIgnoreCase(verified.trim());
    }
    /** Seeds the first platform administrator only after the configured verified Google identity signs in. */
    private UUID seedSuperAdminAccount(GoogleIdentityVerifier.VerifiedIdentity identity) {
        UUID account=UUID.randomUUID();
        jdbc.update("INSERT INTO learning_account(id) VALUES (?)",account);
        jdbc.update("""
            INSERT INTO learning_account_identity(account_id,provider,provider_subject,verified_at,verified_email)
            VALUES (?,'GOOGLE',?,NOW(),?)
            """,account,identity.subject(),identity.email());
        jdbc.update("INSERT INTO learning_account_progress(account_id) VALUES (?)",account);
        grantBootstrapRole(account);
        return account;
    }
    private void grantBootstrapRole(UUID account) {
        jdbc.update("""
            INSERT INTO platform_admin_role(account_id,role) VALUES (?,'SUPER_ADMIN')
            ON CONFLICT(account_id,role) DO NOTHING
            """,account);
        jdbc.update("""
            INSERT INTO platform_admin_audit(actor_id,action,entity_type,entity_id,detail)
            VALUES (?,'BOOTSTRAP_SUPER_ADMIN','ACCOUNT',NULL,'Configured Google email bootstrap')
            """,account);
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
