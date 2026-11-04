package com.alammoba.api;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** A published record is available in public APIs only after human editorial approval. */
@RestController
@RequestMapping("/api/v1/admin/review")
public class PlatformEditorialController {
    private final JdbcTemplate db;
    private final PlatformAdminGuard guard;
    public PlatformEditorialController(JdbcTemplate db,PlatformAdminGuard guard){this.db=db;this.guard=guard;}
    public record Decision(String action,boolean sourceChecked,String note) {}
    public record ReviewTarget(String type,long id,String status,UUID author,UUID reviewer) {}

    @GetMapping("/queue")
    public ResponseEntity<?> queue(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth){
        guard.require(auth);
        Map<String,Object> list=new LinkedHashMap<>();
        list.put("facts",db.query("""
            SELECT id,canonical_key,status FROM content_fact WHERE status IN ('IN_REVIEW','APPROVED')
            ORDER BY id DESC LIMIT 100
            """,(rs,i)->Map.of("id",rs.getLong(1),"label",rs.getString(2),"status",rs.getString(3))));
        list.put("quizzes",db.query("""
            SELECT q.id,COALESCE(t.prompt,''),q.status FROM quiz_question q
            LEFT JOIN quiz_question_translation t ON t.question_id=q.id AND t.locale='en'
            WHERE q.status IN ('IN_REVIEW','APPROVED') ORDER BY q.id DESC LIMIT 100
            """,(rs,i)->Map.of("id",rs.getLong(1),"label",rs.getString(2),"status",rs.getString(3))));
        return privateResult(list);
    }

    @GetMapping("/audit")
    public ResponseEntity<?> audit(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                   @RequestParam(defaultValue="50") int limit){
        guard.require(auth);
        if(limit<1||limit>100)throw PlatformAdminContentController.bad("Invalid limit");
        return privateResult(db.query("""
            SELECT entity_type,entity_id,action,actor_id,from_status,to_status,created_at,details
            FROM editorial_event ORDER BY id DESC LIMIT ?
            """,(rs,i)->{
                Map<String,Object> row=new LinkedHashMap<>();
                row.put("type",rs.getString(1));row.put("id",rs.getLong(2));
                row.put("action",rs.getString(3));row.put("actorId",rs.getObject(4));
                row.put("from",rs.getString(5));row.put("to",rs.getString(6));
                row.put("at",rs.getTimestamp(7).toInstant());row.put("note",rs.getString(8));
                return row;
            },limit));
    }

    @Transactional
    @PostMapping("/{type}/{id}")
    public ResponseEntity<?> decide(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                    @PathVariable String type,@PathVariable long id,@RequestBody Decision request){
        var operator=guard.require(auth);
        if(id<1||request==null||request.action()==null)throw PlatformAdminContentController.bad("Invalid review request");
        String table=switch(type){
            case "facts"->"content_fact";
            case "quizzes"->"quiz_question";
            default->throw PlatformAdminContentController.bad("Unknown editorial entity");
        };
        // Table is selected from fixed server-side literals, never arbitrary user input.
        ReviewTarget item=db.query("SELECT status,created_by,last_reviewed_by FROM "+table+" WHERE id=? FOR UPDATE",
            (rs,i)->new ReviewTarget(type,id,rs.getString(1),rs.getObject(2,UUID.class),
                    rs.getObject(3,UUID.class)),id)
            .stream().findFirst().orElseThrow(PlatformAdminContentController::missing);
        String next;
        String action=request.action();
        switch(action){
            case "submit" -> {
                PlatformAdminGuard.requireEdit(operator);
                requireStatus(item,"DRAFT");next="IN_REVIEW";
            }
            case "approve" -> {
                PlatformAdminGuard.requireReview(operator);
                requireStatus(item,"IN_REVIEW");
                ensureIndependentReviewer(item,operator.id());
                if(type.equals("facts"))approveFact(id,request.sourceChecked());
                else approveQuiz(id);
                next="APPROVED";
            }
            case "reject" -> {
                PlatformAdminGuard.requireReview(operator);
                requireStatus(item,"IN_REVIEW");
                ensureIndependentReviewer(item,operator.id());
                next="DRAFT";
            }
            case "publish" -> {
                PlatformAdminGuard.requirePublish(operator);
                requireStatus(item,"APPROVED");
                if(item.reviewer()==null)throw conflict("An independent review is required");
                if(type.equals("quizzes"))ensurePublishableQuiz(id);
                else ensurePublishableFact(id);
                next="PUBLISHED";
            }
            case "retire" -> {
                PlatformAdminGuard.requirePublish(operator);
                requireStatus(item,"PUBLISHED");next="RETIRED";
            }
            default->throw PlatformAdminContentController.bad("Invalid editorial action");
        }
        if(type.equals("facts")){
            db.update("""
                UPDATE content_fact SET status=?,updated_at=NOW(),
                    last_reviewed_by=CASE WHEN ? IN ('approve','reject') THEN ? ELSE last_reviewed_by END,
                    verified_at=CASE WHEN ?='approve' THEN NOW()
                                     WHEN ? IN ('reject','submit') THEN NULL ELSE verified_at END
                WHERE id=?
                """,next,action,operator.id(),action,action,id);
        }else{
            db.update("""
                UPDATE quiz_question SET status=?,
                    last_reviewed_by=CASE WHEN ? IN ('approve','reject') THEN ? ELSE last_reviewed_by END
                WHERE id=?
                """,next,action,operator.id(),id);
        }
        db.update("""
            INSERT INTO editorial_event(entity_type,entity_id,action,actor_id,from_status,to_status,details)
            VALUES (?,?,?,?,?,?,?)
            """,type.equals("facts")?"FACT":"QUIZ",id,action,operator.id(),item.status(),next,
            safeNote(request.note()));
        return privateResult(Map.of("id",id,"status",next));
    }
    static void requireStatus(ReviewTarget item,String required){
        if(!item.status().equals(required))throw conflict("Required "+required+" status");
    }
    static void ensureIndependentReviewer(ReviewTarget item,UUID reviewer){
        if(item.author()==null||item.author().equals(reviewer))
            throw conflict("An identifiable independent author is required for approval");
    }
    private void approveFact(long id,boolean sourceChecked){
        Integer translated=db.queryForObject("""
            SELECT count(*) FROM content_fact_translation WHERE fact_id=? AND locale IN ('en','fil')
            """,Integer.class,id);
        Integer audience=db.queryForObject("SELECT count(*) FROM content_fact_audience WHERE fact_id=?",Integer.class,id);
        Integer sources=db.queryForObject("SELECT count(*) FROM content_source WHERE fact_id=?",Integer.class,id);
        if(translated==null||translated!=2||audience==null||audience<1||sources==null||sources<1)
            throw conflict("Bilingual translations, an audience and a source are mandatory");
        if(!sourceChecked)throw conflict("An editor must explicitly verify sources before approval");
        db.update("UPDATE content_source SET checked_at=NOW() WHERE fact_id=?",id);
    }
    private void approveQuiz(long id){
        Integer translations=db.queryForObject("""
            SELECT count(*) FROM quiz_question_translation WHERE question_id=? AND locale IN ('en','fil')
            """,Integer.class,id);
        Integer options=db.queryForObject("SELECT count(*) FROM quiz_option WHERE question_id=?",Integer.class,id);
        Integer correct=db.queryForObject("SELECT count(*) FROM quiz_option WHERE question_id=? AND correct",Integer.class,id);
        Integer translatedOptions=db.queryForObject("""
            SELECT count(*) FROM quiz_option_translation t
            JOIN quiz_option o ON o.id=t.option_id WHERE o.question_id=? AND t.locale IN ('en','fil')
            """,Integer.class,id);
        if(translations==null||translations!=2||options==null||options<2||options>6||
           correct==null||correct!=1||translatedOptions==null||translatedOptions!=options*2)
            throw conflict("Quiz needs two translations, 2–6 bilingual choices and one correct option");
    }
    private void ensurePublishableFact(long id){
        Integer good=db.queryForObject("""
            SELECT count(*) FROM content_fact f WHERE f.id=? AND f.verified_at IS NOT NULL
              AND EXISTS(SELECT 1 FROM content_source s WHERE s.fact_id=f.id AND s.checked_at IS NOT NULL)
            """,Integer.class,id);
        if(good==null||good!=1)throw conflict("Fact must have checked sources and verified review");
    }
    private void ensurePublishableQuiz(long id){
        Integer good=db.queryForObject("""
            SELECT count(*) FROM quiz_question q JOIN content_fact f ON f.id=q.fact_id
            WHERE q.id=? AND f.status='PUBLISHED' AND f.verified_at IS NOT NULL
              AND EXISTS(SELECT 1 FROM content_source s WHERE s.fact_id=f.id AND s.checked_at IS NOT NULL)
            """,Integer.class,id);
        if(good==null||good!=1)throw conflict("Publish and verify the parent fact before its quiz");
    }
    private static String safeNote(String note){
        if(note!=null&&note.length()>1000)throw PlatformAdminContentController.bad("Review note too long");
        return note;
    }
    private static ResponseStatusException conflict(String reason){
        return new ResponseStatusException(HttpStatus.CONFLICT,reason);
    }
    private static <T> ResponseEntity<T> privateResult(T item){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(item);
    }
}
