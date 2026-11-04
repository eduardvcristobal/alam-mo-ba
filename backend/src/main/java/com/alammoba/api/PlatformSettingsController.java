package com.alammoba.api;

import java.util.Map;
import java.util.Set;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Strict allowlist: no secrets, SQL names, URLs or arbitrary keys may be set through this API. */
@RestController
@RequestMapping("/api/v1/admin/platform")
public class PlatformSettingsController {
    private static final Set<String> KEYS=Set.of("content_submissions_enabled");
    private final JdbcTemplate db;private final PlatformAdminGuard guard;
    public PlatformSettingsController(JdbcTemplate db,PlatformAdminGuard guard){this.db=db;this.guard=guard;}
    public record SettingChange(boolean value,String reason) {}

    @GetMapping("/settings")
    public ResponseEntity<?> settings(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth){
        guard.require(auth);
        return response(db.query("""
            SELECT setting_key,setting_value,updated_at FROM platform_setting ORDER BY setting_key
            """,(rs,n)->Map.of("key",rs.getString(1),"value",rs.getBoolean(2),
                "updatedAt",rs.getTimestamp(3).toInstant())));
    }
    @Transactional
    @PutMapping("/settings/{key}")
    public ResponseEntity<?> set(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                 @PathVariable String key,@RequestBody SettingChange input){
        var operator=guard.require(auth);
        if(!operator.has("SUPER_ADMIN"))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,"Super-admin role required");
        if(!KEYS.contains(key)||input==null||
           !PlatformAdminContentController.nonblank(input.reason(),500))
            throw PlatformAdminContentController.bad("Unknown setting or missing change reason");
        var previous=db.query("SELECT setting_value FROM platform_setting WHERE setting_key=? FOR UPDATE",
            (rs,n)->rs.getBoolean(1),key);
        if(previous.isEmpty())throw PlatformAdminContentController.missing();
        db.update("""
            UPDATE platform_setting SET setting_value=?,updated_by=?,updated_at=NOW()
            WHERE setting_key=?
            """,input.value(),operator.id(),key);
        db.update("""
            INSERT INTO platform_operator_audit(actor_id,action,target_type,target_id,details)
            VALUES (?,'CHANGE_PLATFORM_SETTING','SETTING',?,?)
            """,operator.id(),key,"Previous="+previous.get(0)+", new="+input.value()+"; "+input.reason().trim());
        return response(Map.of("key",key,"value",input.value()));
    }
    @GetMapping("/audit")
    public ResponseEntity<?> audit(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                   @RequestParam(defaultValue="50") int limit){
        var operator=guard.require(auth);
        if(!operator.has("SUPER_ADMIN","CONTENT_ADMIN"))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,"Insufficient audit permissions");
        if(limit<1||limit>100)throw PlatformAdminContentController.bad("Invalid limit");
        return response(db.query("""
            SELECT action,target_type,target_id,actor_id,details,created_at
            FROM platform_operator_audit ORDER BY id DESC LIMIT ?
            """,(rs,n)->Map.of("action",rs.getString(1),"targetType",rs.getString(2),
                "targetId",rs.getString(3),"actorId",rs.getObject(4),
                "details",rs.getString(5),"at",rs.getTimestamp(6).toInstant()),limit));
    }
    static boolean enabled(JdbcTemplate db,String key){
        if(!KEYS.contains(key))throw PlatformAdminContentController.bad("Unsupported setting");
        Boolean value=db.queryForObject("SELECT setting_value FROM platform_setting WHERE setting_key=?",Boolean.class,key);
        return Boolean.TRUE.equals(value);
    }
    private static <T> ResponseEntity<T> response(T value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
}
