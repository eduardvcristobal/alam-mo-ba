package com.alammoba.api;

import java.util.Map;
import java.util.LinkedHashMap;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/curriculum")
public class PlatformCurriculumController {
    private final JdbcTemplate db;
    private final PlatformAdminGuard guard;
    public PlatformCurriculumController(JdbcTemplate db,PlatformAdminGuard guard){this.db=db;this.guard=guard;}
    public record SubjectInput(String code,String en,String fil,boolean active,int displayOrder) {}
    public record TopicInput(String subject,int grade,String en,String fil,boolean active) {}
    public record TopicAssignment(long topicId) {}

    @GetMapping("/subjects")
    public ResponseEntity<?> subjects(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth) {
        guard.require(auth);
        return response(db.query("""
            SELECT code,name_en,name_fil,active,display_order FROM curriculum_subject
            ORDER BY display_order,code
            """,(rs,n)->Map.of("code",rs.getString(1),"en",rs.getString(2),
                "fil",rs.getString(3),"active",rs.getBoolean(4),"displayOrder",rs.getInt(5))));
    }
    @GetMapping("/topics")
    public ResponseEntity<?> topics(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                    @RequestParam(required=false) String subject,@RequestParam(required=false) Integer grade) {
        guard.require(auth);
        if(grade!=null&&(grade<1||grade>12))throw PlatformAdminContentController.bad("Invalid grade");
        return response(db.query("""
            SELECT id,subject_code,grade_level,name_en,name_fil,active
            FROM curriculum_topic WHERE (CAST(? AS VARCHAR) IS NULL OR subject_code=?)
              AND (CAST(? AS INTEGER) IS NULL OR grade_level=?)
            ORDER BY subject_code,grade_level,name_en LIMIT 500
            """,(rs,n)->Map.of("id",rs.getLong(1),"subject",rs.getString(2),"grade",rs.getInt(3),
                    "en",rs.getString(4),"fil",rs.getString(5),"active",rs.getBoolean(6)),
                subject,subject,grade,grade));
    }

    @PostMapping("/subjects")
    public ResponseEntity<?> createSubject(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                           @RequestBody SubjectInput p){
        PlatformAdminGuard.requirePublish(guard.require(auth));
        checkSubject(p);
        db.update("""
            INSERT INTO curriculum_subject(code,name_en,name_fil,active,display_order) VALUES (?,?,?,?,?)
            """,p.code().trim(),p.en().trim(),p.fil().trim(),p.active(),p.displayOrder());
        return response(Map.of("code",p.code()));
    }
    @PutMapping("/subjects/{code}")
    public ResponseEntity<?> updateSubject(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                           @PathVariable String code,@RequestBody SubjectInput p){
        PlatformAdminGuard.requirePublish(guard.require(auth));
        checkSubject(p);
        if(!code.equals(p.code()))throw PlatformAdminContentController.bad("Subject code cannot change");
        int rows=db.update("""
            UPDATE curriculum_subject SET name_en=?,name_fil=?,active=?,display_order=? WHERE code=?
            """,p.en().trim(),p.fil().trim(),p.active(),p.displayOrder(),code);
        if(rows!=1)throw PlatformAdminContentController.missing();
        return response(Map.of("code",code));
    }
    @PostMapping("/topics")
    public ResponseEntity<?> createTopic(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                         @RequestBody TopicInput p){
        PlatformAdminGuard.requirePublish(guard.require(auth));checkTopic(p);
        Long id=db.queryForObject("""
            INSERT INTO curriculum_topic(subject_code,grade_level,name_en,name_fil,active)
            VALUES (?,?,?,?,?) RETURNING id
            """,Long.class,p.subject(),p.grade(),p.en().trim(),p.fil().trim(),p.active());
        return response(Map.of("id",id));
    }
    @PutMapping("/topics/{id}")
    public ResponseEntity<?> updateTopic(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                         @PathVariable long id,@RequestBody TopicInput p){
        PlatformAdminGuard.requirePublish(guard.require(auth));checkTopic(p);
        int rows=db.update("""
            UPDATE curriculum_topic SET subject_code=?,grade_level=?,name_en=?,name_fil=?,active=? WHERE id=?
            """,p.subject(),p.grade(),p.en().trim(),p.fil().trim(),p.active(),id);
        if(rows!=1)throw PlatformAdminContentController.missing();
        return response(Map.of("id",id));
    }
    @Transactional
    @PutMapping("/facts/{id}/topic")
    public ResponseEntity<?> assignFactTopic(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                             @PathVariable long id,@RequestBody TopicAssignment p){
        PlatformAdminGuard.requireEdit(guard.require(auth));
        if(p==null||p.topicId()<1)throw PlatformAdminContentController.bad("Select a valid topic");
        Integer good=db.queryForObject("""
            SELECT count(*) FROM content_fact f JOIN curriculum_topic t ON t.id=?
            WHERE f.id=? AND f.status='DRAFT' AND t.active
              AND f.subject_code=t.subject_code
              AND EXISTS(SELECT 1 FROM content_fact_audience a
                         WHERE a.fact_id=f.id AND a.audience='STUDENT' AND a.grade_level=t.grade_level)
            """,Integer.class,p.topicId(),id);
        if(good==null||good!=1)throw PlatformAdminContentController.conflict("Topic must match an active grade/subject of a draft fact");
        db.update("UPDATE content_fact SET topic_id=?,updated_at=NOW() WHERE id=? AND status='DRAFT'",p.topicId(),id);
        return response(Map.of("id",id,"topicId",p.topicId()));
    }
    static void checkSubject(SubjectInput p){
        if(p==null||!PlatformAdminContentController.nonblank(p.code(),40)||
           !p.code().matches("[A-Za-z0-9_-]+")||
           !PlatformAdminContentController.nonblank(p.en(),120)||
           !PlatformAdminContentController.nonblank(p.fil(),120)||
           p.displayOrder()<0||p.displayOrder()>100000)
            throw PlatformAdminContentController.bad("Invalid curriculum subject");
    }
    static void checkTopic(TopicInput p){
        if(p==null||!PlatformAdminContentController.nonblank(p.subject(),40)||
           !p.subject().matches("[A-Za-z0-9_-]+")||p.grade()<1||p.grade()>12||
           !PlatformAdminContentController.nonblank(p.en(),200)||
           !PlatformAdminContentController.nonblank(p.fil(),200))
            throw PlatformAdminContentController.bad("Invalid curriculum topic");
    }
    private static <T> ResponseEntity<T> response(T value){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
    }
}
