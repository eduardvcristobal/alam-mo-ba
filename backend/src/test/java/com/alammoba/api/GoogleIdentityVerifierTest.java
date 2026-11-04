package com.alammoba.api;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoogleIdentityVerifierTest {
    private static Jwt claims(String audience,String nonce,boolean verified) {
        Instant now=Instant.now();
        return Jwt.withTokenValue("signed-id-token")
            .header("alg","RS256")
            .claim("iss","https://accounts.google.com")
            .claim("aud",List.of(audience))
            .claim("sub","google-subject-123")
            .claim("nonce",nonce)
            .claim("email_verified",verified)
            .issuedAt(now.minusSeconds(5))
            .expiresAt(now.plusSeconds(3600))
            .build();
    }
    @Test void acceptsMatchingClaimsAfterSignatureVerification() {
        assertThat(GoogleIdentityVerifier.validateClaims(claims("configured-client","server-nonce",true),
            "configured-client","server-nonce")).isEqualTo("google-subject-123");
    }
    @Test void rejectsWrongAudienceNonceAndUnverifiedEmail() {
        assertThatThrownBy(()->GoogleIdentityVerifier.validateClaims(
            claims("other-client","nonce",true),"configured-client","nonce"))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->GoogleIdentityVerifier.validateClaims(
            claims("configured-client","wrong",true),"configured-client","expected"))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->GoogleIdentityVerifier.validateClaims(
            claims("configured-client","nonce",false),"configured-client","nonce"))
            .isInstanceOf(ResponseStatusException.class);
    }
    @Test void nonceAndSessionSecretsAreUnique() {
        String first=AccountIdentityController.randomToken();
        String second=AccountIdentityController.randomToken();
        assertThat(first).hasSize(43).isNotEqualTo(second);
        assertThat(AccountIdentityController.digest(first)).hasSize(64).isNotEqualTo(first);
    }
}
