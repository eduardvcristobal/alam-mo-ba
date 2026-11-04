package com.alammoba.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Safe platform operations. No raw provider IDs, emails or quiz answers in learner directory. */
@RestController
@RequestMapping("/api/v1/admin/operations")
public class AdminOperationsController {
    private final JdbcTemplate jdbc;
    private final AdminAccess access;
    public AdminOperationsController(JdbcTemplate jdbc,AdminAccess access){this.jdbc=jdbc;this.access=access;}
    public record TopicDraft(String subject,int grade,String en,String fil){}
    public record Enabled(boolean enabled){}
    public record SettingInput(String value){}
    public record Aggregate(long learners,long active,long publishedFacts,long publishedQuizzes,long quizAttempts,long pendingPrivacy){}

    @GetMapping("/subjects")
    public ResponseEntity<List<Map<String,Object>>> subjects(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token){
        access.require(token);
        return AdminContentController.privateResponse(jdbc.query(
          "SELECT code,display_name,enabled FROM platform_subject ORDER BY display_name",
          (rs,i)->Map.<String,Object>of("code",rs.getString(1),"name",rs.getString(2),"enabled",rs.getBoolean(3))));
    }
    @GetMapping("/topics")
    public ResponseEntity<List<Map<String,Object>>> topics(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token){
        access.require(token);
        return AdminContentController.privateResponse(jdbc.query("""
          SELECT id,subject_code,grade_level,title_en,title_fil,enabled
          FROM platform_topic ORDER BY subject_code,grade_level,id LIMIT 200
          """,(rs,i)->Map.<String,Object>of("id",rs.getLong(1),"subject",rs.getString(2),
          "grade",rs.getInt(3),"en",rs.getString(4),"fil",rs.getString(5),"enabled",rs.getBoolean(6))));
    }
    @Transactional
    @PostMapping("/topics")
    public ResponseEntity<Map<String,Object>> addTopic(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token,@RequestBody TopicDraft input){
        UUID actor=access.require(token,"CONTENT_ADMIN","EDITOR");
        validateTopic(input);
        Long id=jdbc.queryForObject("""
          INSERT INTO platform_topic(subject_code,grade_level,title_en,title_fil) VALUES (?,?,?,?) RETURNING id
          """,Long.class,input.subject(),input.grade(),input.en().trim(),input.fil().trim());
        access.audit(actor,"CREATE","TOPIC",id);
        return AdminContentController.privateResponse(Map.of("id",id,"created",true));
    }
    @Transactional
    @PutMapping("/topics/{id}/enabled")
    public ResponseEntity<Map<String,Object>> toggleTopic(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token,@PathVariable long id,
      @RequestBody Enabled input){
        UUID actor=access.require(token,"CONTENT_ADMIN");
        if(input==null)throw AdminContentController.bad("Required enabled value");
        int n=jdbc.update("UPDATE platform_topic SET enabled=? WHERE id=?",input.enabled(),id);
        if(n!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Topic missing");
        access.audit(actor,input.enabled()?"ACTIVATE":"DISABLE","TOPIC",id);
        return AdminContentController.privateResponse(Map.of("id",id,"enabled",input.enabled()));
    }
    static void validateTopic(TopicDraft topic){
        if(topic==null || topic.grade()<1 || topic.grade()>12 ||
           topic.subject()==null || !topic.subject().matches("[A-Za-z0-9_-]{1,40}") ||
           !AdminContentController.notBlank(topic.en()) || topic.en().length()>180 ||
           !AdminContentController.notBlank(topic.fil()) || topic.fil().length()>180)
            throw AdminContentController.bad("Topic requires bilingual names, valid subject and grade");
    }

    @GetMapping("/learners")
    public ResponseEntity<List<Map<String,Object>>> learners(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token,
      @RequestParam(defaultValue="50") int limit){
        access.require(token,"SUPPORT");
        if(limit<1||limit>100)throw AdminContentController.bad("Invalid pagination");
        return AdminContentController.privateResponse(jdbc.query("""
          SELECT a.id,a.status,a.created_at,
             COALESCE(jsonb_array_length(p.state->'learned'),0) learned_count
          FROM learning_account a
          LEFT JOIN learning_account_progress p ON p.account_id=a.id
          ORDER BY a.created_at DESC LIMIT ?
          """,(rs,i)->Map.<String,Object>of("accountId",rs.getObject(1,UUID.class),
             "status",rs.getString(2),"createdAt",rs.getTimestamp(3).toInstant().toString(),
             "learnedCount",rs.getInt(4)),limit));
    }
    @Transactional
    @PostMapping("/learners/{id}/{action}")
    public ResponseEntity<Map<String,Object>> status(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token,
      @PathVariable UUID id,@PathVariable String action){
        UUID actor=access.require(token,"SUPER_ADMIN");
        if(actor.equals(id))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Cannot suspend own account");
        String target=switch(action){case "suspend"->"DISABLED";case "reactivate"->"ACTIVE";default->throw AdminContentController.bad("Invalid action");};
        int n=jdbc.update("UPDATE learning_account SET status=? WHERE id=? AND status <> 'DELETED'",target,id);
        if(n!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Account not found");
        if(target.equals("DISABLED"))jdbc.update("UPDATE learning_account_session SET revoked_at=NOW() WHERE account_id=? AND revoked_at IS NULL",id);
        access.audit(actor,action.toUpperCase(),"LEARNER",null);
        return AdminContentController.privateResponse(Map.of("accountId",id,"status",target));
    }

    @GetMapping("/analytics")
    public ResponseEntity<Aggregate> analytics(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token){
        access.require(token,"CONTENT_ADMIN","SUPPORT");
        return AdminContentController.privateResponse(new Aggregate(
          count("SELECT count(*) FROM learning_account"),
          count("SELECT count(*) FROM learning_account WHERE status='ACTIVE'"),
          count("SELECT count(*) FROM content_fact WHERE status='PUBLISHED'"),
          count("SELECT count(*) FROM quiz_question WHERE status='PUBLISHED'"),
          count("SELECT count(*) FROM quiz_attempt"),
          count("SELECT count(*) FROM learning_privacy_request WHERE status<>'CLOSED'")
        ));
    }
    @GetMapping("/privacy")
    public ResponseEntity<List<Map<String,Object>>> privacy(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token){
        access.require(token,"SUPPORT");
        return AdminContentController.privateResponse(jdbc.query("""
          SELECT id,account_id,request_type,status,created_at
          FROM learning_privacy_request ORDER BY created_at DESC LIMIT 100
          """,(rs,i)->Map.<String,Object>of("id",rs.getLong(1),
             "accountId",rs.getObject(2,UUID.class),"type",rs.getString(3),
             "status",rs.getString(4),"createdAt",rs.getTimestamp(5).toInstant().toString())));
    }
    @Transactional
    @PostMapping("/privacy/{id}/review")
    public ResponseEntity<Map<String,Object>> reviewPrivacy(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token,@PathVariable long id){
        UUID actor=access.require(token,"SUPER_ADMIN");
        int n=jdbc.update("""
          UPDATE learning_privacy_request SET status='IN_REVIEW',reviewed_by=?,reviewed_at=NOW()
          WHERE id=? AND status='OPEN'
          """,actor,id);
        if(n!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"Request not open");
        access.audit(actor,"REVIEW","PRIVACY_REQUEST",id);
        return AdminContentController.privateResponse(Map.of("id",id,"status","IN_REVIEW"));
    }
    @GetMapping("/settings")
    public ResponseEntity<List<Map<String,Object>>> settings(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token){
        access.require(token,"SUPER_ADMIN");
        return AdminContentController.privateResponse(jdbc.query(
           "SELECT setting_key,setting_value FROM platform_setting ORDER BY setting_key",
           (rs,i)->Map.<String,Object>of("key",rs.getString(1),"value",rs.getString(2))));
    }
    @Transactional
    @PutMapping("/settings/{key}")
    public ResponseEntity<Map<String,Object>> set(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token,@PathVariable String key,
      @RequestBody SettingInput input){
        UUID actor=access.require(token,"SUPER_ADMIN");
        validateSetting(key,input);
        int n=jdbc.update("""
          UPDATE platform_setting SET setting_value=?,updated_at=NOW(),updated_by=?
          WHERE setting_key=?
          """,input.value(),actor,key);
        if(n!=1)throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        access.audit(actor,"UPDATE_SETTING","SETTING",null);
        return AdminContentController.privateResponse(Map.of("key",key,"value",input.value()));
    }
    static void validateSetting(String key,SettingInput input){
        if(input==null||input.value()==null||input.value().length()>255||
           !(key.equals("maintenance_notice") ||
             (key.equals("daily_challenge_enabled") && (input.value().equals("true")||input.value().equals("false")))))
            throw AdminContentController.bad("Unsupported or invalid setting");
    }
    @GetMapping("/audit")
    public ResponseEntity<List<Map<String,Object>>> audit(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String token){
        access.require(token,"SUPER_ADMIN");
        return AdminContentController.privateResponse(jdbc.query("""
          SELECT id,actor_id,action,entity_type,entity_id,at
          FROM platform_admin_audit ORDER BY id DESC LIMIT 100
          """,(rs,i)->{
              var row=new java.util.LinkedHashMap<String,Object>();
              row.put("id",rs.getLong(1));row.put("actor",rs.getObject(2,UUID.class));
              row.put("action",rs.getString(3));row.put("type",rs.getString(4));
              row.put("entityId",rs.getObject(5));row.put("at",rs.getTimestamp(6).toInstant().toString());
              return row;
          }));
    }
    private long count(String query){return jdbc.queryForObject(query,Long.class);}
}
