package com.alammoba.api;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Enforces admin roles on every operation, not just the React route. */
@Component
public class AdminAccess {
    private final JdbcTemplate jdbc;
    private final AccountIdentityController identity;
    public AdminAccess(JdbcTemplate jdbc,AccountIdentityController identity) {
        this.jdbc=jdbc;this.identity=identity;
    }
    public UUID require(String bearer,String... roles) {
        UUID actor=identity.accountFromHeader(bearer);
        List<String> available=jdbc.query(
            "SELECT role FROM platform_admin_role WHERE account_id=?",
            (rs,i)->rs.getString(1),actor);
        if(available.isEmpty())throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Platform admin access required");
        if(roles.length>0 && !available.contains("SUPER_ADMIN")) {
            Set<String> accepted=Set.of(roles);
            if(available.stream().noneMatch(accepted::contains))
                throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Insufficient admin role");
        }
        return actor;
    }
    public List<String> roles(UUID actor) {
        return jdbc.query("SELECT role FROM platform_admin_role WHERE account_id=? ORDER BY role",
            (rs,i)->rs.getString(1),actor);
    }
    public void audit(UUID actor,String action,String type,Long id) {
        jdbc.update("INSERT INTO platform_admin_audit(actor_id,action,entity_type,entity_id) VALUES (?,?,?,?)",
            actor,action,type,id);
    }
}
