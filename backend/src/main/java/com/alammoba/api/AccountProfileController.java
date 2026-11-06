package com.alammoba.api;

import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/account/profile")
public class AccountProfileController {
    private final JdbcTemplate jdbc;
    private final AccountIdentityController identity;

    public AccountProfileController(JdbcTemplate jdbc, AccountIdentityController identity) {
        this.jdbc = jdbc;
        this.identity = identity;
    }

    public record Profile(String displayName) {}
    public record UpdateProfile(String displayName) {}

    @GetMapping
    public ResponseEntity<Profile> read(
            @RequestHeader(value=HttpHeaders.AUTHORIZATION, required=false) String authorization) {
        UUID account = identity.accountFromHeader(authorization);
        return privateResponse(find(account));
    }

    @PutMapping
    public ResponseEntity<Profile> update(
            @RequestHeader(value=HttpHeaders.AUTHORIZATION, required=false) String authorization,
            @RequestBody UpdateProfile request) {
        UUID account = identity.accountFromHeader(authorization);
        String name = request == null || request.displayName() == null ? "" : request.displayName().trim();
        if (!valid(name)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "Choose a 3–24 character alias using letters, numbers, spaces, hyphens, or underscores. Do not use an email address.");
        }
        try {
            jdbc.update("""
                UPDATE learning_account_profile
                SET display_name=?, updated_at=NOW()
                WHERE account_id=?
                """, name, account);
        } catch (DuplicateKeyException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                "That display name is already in use. Please choose another alias.");
        }
        return privateResponse(find(account));
    }

    private Profile find(UUID account) {
        return jdbc.query("SELECT display_name FROM learning_account_profile WHERE account_id=?",
            (rs, row) -> new Profile(rs.getString(1)), account).stream().findFirst()
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Account profile not found"));
    }

    private static boolean valid(String value) {
        if (value.length() < 3 || value.length() > 24 || value.indexOf('@') >= 0) return false;
        int index = 0;
        boolean first = true;
        while (index < value.length()) {
            int cp = value.codePointAt(index);
            if (!(Character.isLetterOrDigit(cp) || cp == ' ' || cp == '-' || cp == '_')) return false;
            if (first && !Character.isLetterOrDigit(cp)) return false;
            first = false;
            index += Character.charCount(cp);
        }
        return true;
    }

    private static <T> ResponseEntity<T> privateResponse(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
