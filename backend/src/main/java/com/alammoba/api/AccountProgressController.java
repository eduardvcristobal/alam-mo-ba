package com.alammoba.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * Account-owned progress. Requires a verified, live account session on every
 * request; a guest capability is accepted only as additional proof during import.
 */
@RestController
@RequestMapping("/api/v1/account")
public class AccountProgressController {
    private static final ObjectMapper JSON=new ObjectMapper();
    private final JdbcTemplate jdbc;
    private final AccountIdentityController identity;

    public AccountProgressController(JdbcTemplate jdbc,AccountIdentityController identity) {
        this.jdbc=jdbc;
        this.identity=identity;
    }

    public record VersionedState(long version,JsonNode state) {}
    public record PutState(long expectedVersion,JsonNode state) {}
    public record ImportGuest(String guestToken) {}

    @GetMapping("/progress")
    public ResponseEntity<VersionedState> read(
        @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String authorization) {
        return privateResponse(state(identity.accountFromHeader(authorization),false));
    }

    @PutMapping("/progress")
    public ResponseEntity<VersionedState> update(
        @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String authorization,
        @RequestBody PutState request) {
        UUID account=identity.accountFromHeader(authorization);
        if(request==null || request.expectedVersion()<0)
            throw bad("Expected nonnegative progress version");
        String json=GuestProgressController.validateState(request.state());
        int updated=jdbc.update("""
            UPDATE learning_account_progress
            SET state=CAST(? AS jsonb),version=version+1,updated_at=NOW()
            WHERE account_id=? AND version=?
            """,json,account,request.expectedVersion());
        if(updated==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Progress changed; fetch and merge");
        return privateResponse(state(account,false));
    }

    @Transactional
    @PostMapping("/import-guest")
    public ResponseEntity<VersionedState> importGuest(
        @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String authorization,
        @RequestBody ImportGuest input) {
        UUID account=identity.accountFromHeader(authorization);
        if(input==null || input.guestToken()==null ||
           !input.guestToken().matches("[A-Za-z0-9_-]{43}"))
            throw bad("A valid guest capability is required");
        String tokenDigest=AccountIdentityController.digest(input.guestToken());
        var candidates=jdbc.query("""
            SELECT id,revoked_at FROM learning_guest_credential
            WHERE token_sha256=? AND expires_at>NOW() FOR UPDATE
            """,(rs,i)->new Object[]{rs.getObject(1,UUID.class),rs.getTimestamp(2)},tokenDigest);
        if(candidates.size()!=1)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Guest capability expired or unavailable");
        UUID guest=(UUID)candidates.get(0)[0];
        var imported=jdbc.query("""
            SELECT account_id FROM learning_guest_account_import WHERE guest_id=?
            """,(rs,i)->rs.getObject(1,UUID.class),guest);
        if(!imported.isEmpty()) {
            if(!account.equals(imported.get(0)))
                throw new ResponseStatusException(HttpStatus.CONFLICT,"Guest already imported");
            return privateResponse(state(account,false)); // Repeat is idempotent for the owner.
        }
        if(candidates.get(0)[1]!=null)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Guest token revoked");

        VersionedState original=state(account,true);
        JsonNode guestState=jdbc.query("""
            SELECT state::text FROM learning_guest_progress WHERE guest_id=?
            """,(rs,i)->parse(rs.getString(1)),guest).stream().findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Guest progress missing"));

        JsonNode merged=ProgressMerge.merge(original.state(),guestState);
        String json=GuestProgressController.validateState(merged);
        int updated=jdbc.update("""
            UPDATE learning_account_progress
            SET state=CAST(? AS jsonb),version=version+1,updated_at=NOW()
            WHERE account_id=? AND version=?
            """,json,account,original.version());
        if(updated!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"Account progress changed");

        jdbc.update("""
            INSERT INTO learning_guest_account_import(guest_id,account_id) VALUES (?,?)
            """,guest,account);
        jdbc.update("""
            UPDATE learning_guest_credential SET revoked_at=NOW() WHERE id=?
            """,guest);
        return privateResponse(state(account,false));
    }

    private VersionedState state(UUID account,boolean lock) {
        String sql="SELECT version,state::text FROM learning_account_progress WHERE account_id=?"
            +(lock?" FOR UPDATE":"");
        return jdbc.query(sql,(rs,i)->new VersionedState(rs.getLong(1),parse(rs.getString(2))),account)
            .stream().findFirst().orElseThrow(
                ()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Account progress missing"));
    }

    private static JsonNode parse(String source) {
        try {return JSON.readTree(source);}
        catch(Exception e){throw new IllegalStateException("Invalid stored progress",e);}
    }
    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
    private static ResponseStatusException bad(String text) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST,text);
    }
}
