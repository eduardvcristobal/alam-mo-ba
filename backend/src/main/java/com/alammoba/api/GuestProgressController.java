package com.alammoba.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * An anonymous session is a revocable capability: possession of its 256-bit
 * bearer token grants access ONLY to that session's guest-progress document.
 * This is not user authentication, and must never be used for a registered account.
 */
@RestController
@RequestMapping("/api/v1/guest")
@CrossOrigin(origins = "${app.cors.origin:http://localhost:5173}")
public class GuestProgressController {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MAX_STATE_BYTES = 64 * 1024;
    private static final Set<String> FIELDS = Set.of(
        "mode","lang","grade","subject","count","saved","learned","streak","last","attempts");
    private final JdbcTemplate jdbc;

    public GuestProgressController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record CreatedGuest(String token, Instant expiresAt) {}
    public record VersionedState(long version, JsonNode state) {}
    public record PutState(long expectedVersion, JsonNode state) {}

    @PostMapping("/sessions")
    public ResponseEntity<CreatedGuest> create() {
        byte[] tokenBytes = new byte[32];
        RANDOM.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        Instant expires = Instant.now().plus(90, ChronoUnit.DAYS);
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO learning_guest_credential (id, token_sha256, expires_at) VALUES (?, ?, ?)",
            id, digest(token), java.sql.Timestamp.from(expires));
        jdbc.update("INSERT INTO learning_guest_progress (guest_id) VALUES (?)", id);
        return noStore(new CreatedGuest(token, expires));
    }

    @GetMapping("/progress")
    public ResponseEntity<VersionedState> progress(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required=false) String authorization) {
        UUID guestId = authenticate(authorization);
        return noStore(get(guestId));
    }

    @PutMapping("/progress")
    public ResponseEntity<VersionedState> update(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required=false) String authorization,
            @RequestBody PutState request) {
        UUID guestId = authenticate(authorization);
        if (request == null || request.expectedVersion() < 0) {
            throw invalid("expectedVersion must be nonnegative");
        }
        String state = validateState(request.state());
        int changed = jdbc.update("""
                UPDATE learning_guest_progress
                SET state = CAST(? AS jsonb), version = version+1, updated_at=NOW()
                WHERE guest_id=? AND version=?
                """, state, guestId, request.expectedVersion());
        if (changed == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Progress changed; fetch and merge before retry");
        }
        return noStore(get(guestId));
    }

    @PostMapping("/sessions/revoke")
    public ResponseEntity<Void> revoke(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required=false) String authorization) {
        UUID guestId = authenticate(authorization);
        jdbc.update("DELETE FROM learning_guest_credential WHERE id=?", guestId); // ON DELETE CASCADE erases anonymous backup data
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    private UUID authenticate(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Guest token required");
        }
        String token = authorization.substring(7);
        if (!token.matches("[A-Za-z0-9_-]{43}")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid guest token");
        }
        return jdbc.query("""
            SELECT id FROM learning_guest_credential
            WHERE token_sha256=? AND revoked_at IS NULL AND expires_at > NOW()
            """, (rs, i) -> rs.getObject(1, UUID.class), digest(token))
            .stream().findFirst().orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown, expired, or revoked guest token"));
    }

    private VersionedState get(UUID id) {
        return jdbc.query("""
            SELECT version, state::text FROM learning_guest_progress WHERE guest_id=?
            """, (rs, row) -> {
                try {
                    return new VersionedState(rs.getLong(1), JSON.readTree(rs.getString(2)));
                } catch (Exception ex) {
                    throw new IllegalStateException("Stored progress is not valid JSON", ex);
                }
            }, id).stream().findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    static String validateState(JsonNode node) {
        if (node == null || !node.isObject()) throw invalid("Progress must be a JSON object");
        if (node.size() > FIELDS.size()) throw invalid("Unexpected progress fields");
        for (var key = node.fieldNames(); key.hasNext();) {
            if (!FIELDS.contains(key.next())) throw invalid("Unexpected progress field");
        }
        if (!node.has("saved") || !node.get("saved").isArray() || node.get("saved").size()>10000 ||
            !node.has("learned") || !node.get("learned").isArray() || node.get("learned").size()>10000 ||
            !node.has("attempts") || !node.get("attempts").isArray() || node.get("attempts").size()>100) {
            throw invalid("Invalid progress collections");
        }
        for (String field : new String[]{"saved","learned"}) {
            for (JsonNode value : node.get(field)) if (!value.isIntegralNumber()) throw invalid("Invalid fact ID");
        }
        if (node.has("count") && (!node.get("count").isInt() || node.get("count").asInt()<1 || node.get("count").asInt()>100)) {
            throw invalid("Invalid quiz count");
        }
        if (node.has("streak") && (!node.get("streak").isInt() || node.get("streak").asInt()<0)) {
            throw invalid("Invalid streak");
        }
        if (node.has("mode") && !Set.of("student","explore").contains(node.get("mode").asText())) throw invalid("Invalid learning mode");
        if (node.has("lang") && !Set.of("en","fil").contains(node.get("lang").asText())) throw invalid("Invalid language");
        String result = node.toString();
        if (result.getBytes(StandardCharsets.UTF_8).length > MAX_STATE_BYTES) throw invalid("Progress too large");
        return result;
    }

    private static String digest(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII)));
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
    private static ResponseStatusException invalid(String detail) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, detail);
    }
    private static <T> ResponseEntity<T> noStore(T payload) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(payload);
    }
}
