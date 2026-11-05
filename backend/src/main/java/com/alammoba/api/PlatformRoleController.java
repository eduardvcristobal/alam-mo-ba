package com.alammoba.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Restricted, reason-recorded platform role assignment for super administrators. */
@RestController
@RequestMapping("/api/v1/admin/roles")
public class PlatformRoleController {
    private static final Set<String> ROLES=Set.of("SUPER_ADMIN","CONTENT_ADMIN","EDITOR","REVIEWER","SUPPORT");
    private final JdbcTemplate db;
    private final PlatformAdminGuard guard;
    public PlatformRoleController(JdbcTemplate db,PlatformAdminGuard guard){this.db=db;this.guard=guard;}

    public record AccountRoles(UUID accountId,String status,Instant createdAt,List<String> roles){}
    public record RoleChange(UUID accountId,String role,String action,String reason){}

    @GetMapping("/accounts")
    public ResponseEntity<List<AccountRoles>> accounts(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
      @RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="100") int limit){
        requireSuperAdmin(auth);
        PlatformAdminContentController.checkPaging(offset,limit);
        List<AccountRoles> rows=db.query("""
            SELECT id,status,created_at FROM learning_account
            WHERE status<>'DELETED' ORDER BY created_at DESC,id LIMIT ? OFFSET ?
            """,(rs,n)->new AccountRoles(rs.getObject(1,UUID.class),rs.getString(2),
                rs.getTimestamp(3).toInstant(),List.of()),limit,offset);
        List<AccountRoles> result=rows.stream().map(account->new AccountRoles(account.accountId(),
            account.status(),account.createdAt(),db.query(
                "SELECT role FROM platform_admin_role WHERE account_id=? ORDER BY role",
                (rs,n)->rs.getString(1),account.accountId()))).toList();
        return response(result);
    }

    @Transactional
    @PostMapping("/change")
    public ResponseEntity<Map<String,Object>> change(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
      @RequestBody RoleChange input){
        var actor=requireSuperAdmin(auth);
        if(input==null||input.accountId()==null||!ROLES.contains(input.role())||
           !("GRANT".equals(input.action())||"REVOKE".equals(input.action()))||
           !PlatformAdminContentController.nonblank(input.reason(),500))
            throw PlatformAdminContentController.bad("Choose an account, role, action and reason");
        String status=db.query("SELECT status FROM learning_account WHERE id=?",
            (rs,n)->rs.getString(1),input.accountId()).stream().findFirst()
            .orElseThrow(PlatformAdminContentController::missing);
        int changed;
        if(input.action().equals("GRANT")){
            if(!status.equals("ACTIVE"))throw PlatformAdminContentController.conflict("Roles can only be granted to active accounts");
            changed=db.update("""
                INSERT INTO platform_admin_role(account_id,role) VALUES (?,?)
                ON CONFLICT(account_id,role) DO NOTHING
                """,input.accountId(),input.role());
        }else{
            if(input.role().equals("SUPER_ADMIN")){
                if(actor.id().equals(input.accountId()))
                    throw PlatformAdminContentController.conflict("You cannot revoke your own SUPER_ADMIN role");
                Integer remaining=db.queryForObject("""
                    SELECT count(*) FROM platform_admin_role r JOIN learning_account a ON a.id=r.account_id
                    WHERE r.role='SUPER_ADMIN' AND a.status='ACTIVE' AND r.account_id<>?
                    """,Integer.class,input.accountId());
                if(remaining==null||remaining<1)
                    throw PlatformAdminContentController.conflict("At least one active SUPER_ADMIN must remain");
            }
            changed=db.update("DELETE FROM platform_admin_role WHERE account_id=? AND role=?",
                input.accountId(),input.role());
        }
        if(changed>0)db.update("""
            INSERT INTO platform_operator_audit(actor_id,action,target_type,target_id,details)
            VALUES (?,?,'ACCOUNT',?,?)
            """,actor.id(),input.action().equals("GRANT")?"GRANT_PLATFORM_ROLE":"REVOKE_PLATFORM_ROLE",
                input.accountId().toString(),input.role()+"; "+input.reason().trim());
        return response(Map.of("accountId",input.accountId(),"role",input.role(),
            "action",input.action(),"changed",changed>0));
    }

    private PlatformAdminGuard.Operator requireSuperAdmin(String auth){
        var operator=guard.require(auth);
        if(!operator.has("SUPER_ADMIN"))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Super-admin role required");
        return operator;
    }
    private static <T> ResponseEntity<T> response(T value){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
    }
}
