package com.alammoba.api;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/**
 * Learner privacy: expose pseudonymous account IDs, status and timestamps only;
 * never expose emails, provider subjects, quiz answers or progress payloads.
 */
@RestController
@RequestMapping("/api/v1/admin/learners")
public class PlatformLearnerController {
    private final JdbcTemplate db;private final PlatformAdminGuard guard;
    public PlatformLearnerController(JdbcTemplate db,PlatformAdminGuard guard){this.db=db;this.guard=guard;}
    public record StatusChange(String status,String reason) {}
    @GetMapping
    public ResponseEntity<?> list(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                  @RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="30") int limit){
        guard.require(auth);
        PlatformAdminContentController.checkPaging(offset,limit);
        return response(db.query("""
            SELECT id,status,created_at FROM learning_account
            WHERE status<>'DELETED' ORDER BY created_at DESC,id LIMIT ? OFFSET ?
            """,(rs,n)->Map.of("id",rs.getObject(1,UUID.class),
            "status",rs.getString(2),"createdAt",rs.getTimestamp(3).toInstant()),limit,offset));
    }
    @Transactional
    @PutMapping("/{id}/status")
    public ResponseEntity<?> status(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                    @PathVariable UUID id,@RequestBody StatusChange change){
        var actor=guard.require(auth);
        if(!actor.has("SUPER_ADMIN"))throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,"Super-admin approval required");
        if(change==null||!("ACTIVE".equals(change.status())||"DISABLED".equals(change.status()))||
           !PlatformAdminContentController.nonblank(change.reason(),500))
            throw PlatformAdminContentController.bad("Provide a valid status and reason");
        if(actor.id().equals(id))throw PlatformAdminContentController.conflict("An operator cannot disable or modify their own account");
        Integer privileged=db.queryForObject("""
            SELECT count(*) FROM platform_admin_role WHERE account_id=? AND role='SUPER_ADMIN'
            """,Integer.class,id);
        if(privileged!=null&&privileged>0)throw PlatformAdminContentController.conflict("Do not alter another super-admin via learner operations");
        int rows=db.update("""
            UPDATE learning_account SET status=? WHERE id=? AND status<>'DELETED'
            """,change.status(),id);
        if(rows!=1)throw PlatformAdminContentController.missing();
        db.update("""
            INSERT INTO platform_operator_audit(actor_id,action,target_type,target_id,details)
            VALUES (?,'SET_LEARNER_STATUS','ACCOUNT',?,?)
            """,actor.id(),id.toString(),change.reason().trim());
        return response(Map.of("id",id,"status",change.status()));
    }
    private static <T> ResponseEntity<T> response(T value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
}
