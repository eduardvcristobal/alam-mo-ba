package com.alammoba.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Authenticated account data access and erasure; no arbitrary account IDs accepted. */
@RestController
@RequestMapping("/api/v1/account")
public class AccountPrivacyController {
    private static final ObjectMapper JSON=new ObjectMapper();
    private final JdbcTemplate jdbc;
    private final AccountIdentityController identity;

    public AccountPrivacyController(JdbcTemplate jdbc,AccountIdentityController identity){
        this.jdbc=jdbc;
        this.identity=identity;
    }

    public record AccountExport(UUID accountId,long version,JsonNode progress,List<String> providers) {}
    public record DeleteConfirmation(String confirmation) {}

    @GetMapping("/export")
    public ResponseEntity<AccountExport> export(
        @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String header) {
        UUID account=identity.accountFromHeader(header);
        var progress=jdbc.query("""
            SELECT version,state::text FROM learning_account_progress WHERE account_id=?
            """,(rs,i)->new Object[]{rs.getLong(1),rs.getString(2)},account);
        if(progress.size()!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var providers=jdbc.query("""
            SELECT DISTINCT provider FROM learning_account_identity WHERE account_id=?
            """,(rs,i)->rs.getString(1),account);
        try{
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Content-Disposition","attachment; filename=alam-mo-ba-account.json")
                .body(new AccountExport(account,(Long)progress.get(0)[0],
                    JSON.readTree((String)progress.get(0)[1]),providers));
        }catch(Exception e){throw new IllegalStateException("Unable to export account progress",e);}
    }

    @Transactional
    @DeleteMapping
    public ResponseEntity<Void> delete(
        @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String header,
        @RequestBody(required=false) DeleteConfirmation input) {
        UUID account=identity.accountFromHeader(header);
        if(input==null || !"DELETE MY ACCOUNT".equals(input.confirmation()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Explicit deletion confirmation required");
        // Destructive action requires an account session issued within the last 15 minutes.
        String digest=AccountIdentityController.digest(header.substring(7));
        Integer recent=jdbc.queryForObject("""
            SELECT count(*) FROM learning_account_session
            WHERE token_sha256=? AND account_id=? AND revoked_at IS NULL
              AND created_at >= NOW()-INTERVAL '15 minutes'
            """,Integer.class,digest,account);
        if(recent==null || recent!=1)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Sign in again before account deletion");
        // Remove imported guest backups before deleting the associated import ownership.
        // FK cascades erase guest progress, account sessions, identity and account progress.
        jdbc.update("""
            DELETE FROM learning_guest_credential
            WHERE id IN (SELECT guest_id FROM learning_guest_account_import WHERE account_id=?)
            """,account);
        jdbc.update("DELETE FROM learning_account WHERE id=?",account);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
