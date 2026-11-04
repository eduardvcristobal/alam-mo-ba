package com.alammoba.api;

import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Every admin API request is independently authenticated against a live,
 * revocable account session. No privilege is inferred from email or browser state.
 */
@Component
public class PlatformAdminGuard {
    private final AccountIdentityController identity;
    private final JdbcTemplate jdbc;
    public PlatformAdminGuard(AccountIdentityController identity,JdbcTemplate jdbc) {
        this.identity=identity;this.jdbc=jdbc;
    }
    public record Operator(UUID id,Set<String> roles) {
        boolean mayEdit(){return has("SUPER_ADMIN","CONTENT_ADMIN","EDITOR");}
        boolean mayReview(){return has("SUPER_ADMIN","CONTENT_ADMIN","REVIEWER");}
        boolean mayPublish(){return has("SUPER_ADMIN","CONTENT_ADMIN");}
        boolean mayRead(){return !roles.isEmpty();}
        boolean has(String... expected){
            for(String role:expected)if(roles.contains(role))return true;
            return false;
        }
    }
    public Operator require(String authorization) {
        UUID id=identity.accountFromHeader(authorization);
        Set<String> roles=Set.copyOf(jdbc.query("""
            SELECT role FROM platform_admin_role WHERE account_id=?
            """,(rs,n)->rs.getString(1),id));
        if(roles.isEmpty())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Platform admin role required");
        return new Operator(id,roles);
    }
    public static void requireEdit(Operator operator) {
        if(!operator.mayEdit())deny();
    }
    public static void requireReview(Operator operator) {
        if(!operator.mayReview())deny();
    }
    public static void requirePublish(Operator operator) {
        if(!operator.mayPublish())deny();
    }
    private static void deny(){throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Insufficient admin permissions");}
}
