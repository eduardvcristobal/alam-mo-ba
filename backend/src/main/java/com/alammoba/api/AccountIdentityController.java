package com.alammoba.api;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/account")
public class AccountIdentityController {
    private static final SecureRandom RANDOM=new SecureRandom();
    private final JdbcTemplate jdbc;
    private final GoogleIdentityVerifier verifier;
    private final boolean registrationEnabled;

    public AccountIdentityController(JdbcTemplate jdbc, GoogleIdentityVerifier verifier,
         @Value("\${app.account.registration-enabled:false}") boolean registrationEnabled) {
        this.jdbc=jdbc;
        this.verifier=verifier;
        this.registrationEnabled=registrationEnabled;
    }

    public record Challenge(String nonce, Instant expiresAt) {}
    public record GoogleLogin(String idToken, String nonce) {}
    public record AccountSession(String token, UUID accountId, Instant expiresAt) {}
    public record AccountMe(UUID accountId) {}

    @PostMapping("/google/challenge")
    public ResponseEntity<Challenge> challenge() {
        requireRegistrationEnabled();
        String nonce=randomToken();
        Instant expires=Instant.now().plus(5,ChronoUnit.MINUTES);
        jdbc.update("INSERT INTO learning_login_challenge (id,nonce_sha256,expires_at) VALUES (?,?,?)",
            UUID.randomUUID(),digest(nonce),java.sql.Timestamp.from(expires));
        return secret(new Challenge(nonce,expires));
    }

    @Transactional
    @PostMapping("/google")
    public ResponseEntity<AccountSession> login(@RequestBody GoogleLogin input) {
        requireRegistrationEnabled();
        if(input==null || input.nonce()==null || !input.nonce().matches("[A-Za-z0-9_-]{43}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid login challenge");
        }
        String subject=verifier.verifySubject(input.idToken(),input.nonce());
        int consumed=jdbc.update("""
            UPDATE learning_login_challenge SET consumed_at=NOW()
            WHERE nonce_sha256=? AND expires_at>NOW() AND consumed_at IS NULL
            """,digest(input.nonce()));
        if(consumed!=1)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Expired or replayed login challenge");

        var accounts=jdbc.query("""
            SELECT account_id FROM learning_account_identity
            WHERE provider='GOOGLE' AND provider_subject=?
            """,(rs,i)->rs.getObject(1,UUID.class),subject);
        UUID accountId;
        if(accounts.isEmpty()) {
            accountId=UUID.randomUUID();
            jdbc.update("INSERT INTO learning_account(id) VALUES (?)",accountId);
            jdbc.update("""
                INSERT INTO learning_account_identity(account_id,provider,provider_subject,verified_at)
                VALUES (?,'GOOGLE',?,NOW())
                """,accountId,subject);
            jdbc.update("INSERT INTO learning_account_progress(account_id) VALUES (?)",accountId);
        } else {
            accountId=accounts.get(0);
        }
        Integer active=jdbc.queryForObject(
            "SELECT count(*) FROM learning_account WHERE id=? AND status='ACTIVE'",Integer.class,accountId);
        if(active==null||active!=1)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Account disabled");

        String token=randomToken();
        Instant expires=Instant.now().plus(24,ChronoUnit.HOURS);
        jdbc.update("""
            INSERT INTO learning_account_session(id,account_id,token_sha256,expires_at)
            VALUES (?,?,?,?)
            """,UUID.randomUUID(),accountId,digest(token),java.sql.Timestamp.from(expires));
        return secret(new AccountSession(token,accountId,expires));
    }

    @GetMapping("/me")
    public ResponseEntity<AccountMe> me(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String header) {
        return secret(new AccountMe(accountFromHeader(header)));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String header) {
        UUID account=accountFromHeader(header);
        jdbc.update("UPDATE learning_account_session SET revoked_at=NOW() WHERE token_sha256=? AND account_id=?",
            digest(header.substring(7)),account);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    UUID accountFromHeader(String header) {
        if(header==null || !header.startsWith("Bearer ") ||
           !header.substring(7).matches("[A-Za-z0-9_-]{43}")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Account token required");
        }
        return jdbc.query("""
            SELECT s.account_id FROM learning_account_session s
            JOIN learning_account a ON a.id=s.account_id
            WHERE s.token_sha256=? AND s.expires_at>NOW()
              AND s.revoked_at IS NULL AND a.status='ACTIVE'
            """,(rs,i)->rs.getObject(1,UUID.class),digest(header.substring(7)))
            .stream().findFirst().orElseThrow(()->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Account session expired or revoked"));
    }

    private void requireRegistrationEnabled() {
        if(!registrationEnabled)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
            "Account registration is disabled pending privacy acceptance");
    }

    static String randomToken() {
        byte[] bytes=new byte[32];RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.US_ASCII)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static <T> ResponseEntity<T> secret(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
