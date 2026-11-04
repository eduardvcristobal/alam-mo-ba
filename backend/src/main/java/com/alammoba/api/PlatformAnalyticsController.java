package com.alammoba.api;

import java.util.Map;
import java.util.LinkedHashMap;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/**
 * Aggregate-only analytics. This API never returns user-level progress,
 * provider identity, personal identifiers or raw quiz attempts.
 */
@RestController
@RequestMapping("/api/v1/admin/analytics")
public class PlatformAnalyticsController {
    private final JdbcTemplate db;private final PlatformAdminGuard guard;
    public PlatformAnalyticsController(JdbcTemplate db,PlatformAdminGuard guard){this.db=db;this.guard=guard;}
    @GetMapping
    public ResponseEntity<?> overview(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth){
        guard.require(auth);
        Map<String,Object> overview=new LinkedHashMap<>();
        overview.put("registeredAccounts",count("SELECT count(*) FROM learning_account WHERE status<>'DELETED'"));
        overview.put("activeAccounts",count("SELECT count(*) FROM learning_account WHERE status='ACTIVE'"));
        overview.put("disabledAccounts",count("SELECT count(*) FROM learning_account WHERE status='DISABLED'"));
        overview.put("guestBackups",count("""
            SELECT count(*) FROM learning_guest_credential WHERE revoked_at IS NULL AND expires_at>NOW()
            """));
        overview.put("recordedQuizAttempts",count("SELECT count(*) FROM quiz_attempt"));
        overview.put("publishedFacts",count("SELECT count(*) FROM content_fact WHERE status='PUBLISHED'"));
        overview.put("publishedQuizQuestions",count("SELECT count(*) FROM quiz_question WHERE status='PUBLISHED'"));
        overview.put("factsBySubject",db.query("""
            SELECT subject_code,count(*) FROM content_fact
            WHERE status='PUBLISHED' GROUP BY subject_code ORDER BY subject_code
            """,(rs,n)->Map.of("subject",rs.getString(1),"count",rs.getLong(2))));
        overview.put("factsByStatus",db.query("""
            SELECT status,count(*) FROM content_fact GROUP BY status ORDER BY status
            """,(rs,n)->Map.of("status",rs.getString(1),"count",rs.getLong(2))));
        overview.put("quizzesByStatus",db.query("""
            SELECT status,count(*) FROM quiz_question GROUP BY status ORDER BY status
            """,(rs,n)->Map.of("status",rs.getString(1),"count",rs.getLong(2))));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(overview);
    }
    private long count(String query){Long count=db.queryForObject(query,Long.class);return count==null?0:count;}
}
