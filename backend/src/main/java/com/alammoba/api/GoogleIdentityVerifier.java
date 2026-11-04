package com.alammoba.api;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/**
 * Only Google-signed RS256 ID tokens with the configured client audience are accepted.
 * No unsigned or frontend-supplied profile claims are trusted.
 */
@Component
public class GoogleIdentityVerifier {
    private final String clientId;
    private final JwtDecoder decoder;

    public GoogleIdentityVerifier(@Value("${app.google.client-id:}") String clientId) {
        this.clientId = clientId;
        if (clientId == null || clientId.isBlank()) {
            this.decoder = null; // No sign-in endpoint without explicitly configured OAuth client.
        } else {
            NimbusJwtDecoder jwt = NimbusJwtDecoder.withJwkSetUri(
                "https://www.googleapis.com/oauth2/v3/certs")
                .jwsAlgorithm(SignatureAlgorithm.RS256).build();
            jwt.setJwtValidator(JwtValidators.createDefaultWithIssuer("https://accounts.google.com"));
            this.decoder = jwt;
        }
    }

    public String verifySubject(String signedToken, String expectedNonce) {
        if (decoder == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google login not configured");
        }
        if (signedToken == null || signedToken.length() > 16_384) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid ID token");
        }
        try {
            Jwt jwt = decoder.decode(signedToken);
            return validateClaims(jwt, clientId, expectedNonce);
        } catch (JwtException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Google identity token");
        }
    }

    static String validateClaims(Jwt jwt, String clientId, String nonce) {
        if (clientId == null || clientId.isBlank() || nonce == null || nonce.isBlank() ||
                !jwt.getAudience().contains(clientId) ||
                !Set.of("https://accounts.google.com").contains(jwt.getIssuer().toString()) ||
                !nonce.equals(jwt.getClaimAsString("nonce")) ||
                !Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified")) ||
                jwt.getSubject() == null || jwt.getSubject().isBlank() ||
                jwt.getSubject().length() > 255 ||
                jwt.getExpiresAt() == null || !jwt.getExpiresAt().isAfter(Instant.now()) ||
                jwt.getIssuedAt() == null || jwt.getIssuedAt().isAfter(Instant.now().plusSeconds(60))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid Google identity claims");
        }
        return jwt.getSubject();
    }
}
