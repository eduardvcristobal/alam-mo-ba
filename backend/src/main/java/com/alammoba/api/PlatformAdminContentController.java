package com.alammoba.api;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin")
public class PlatformAdminContentController {
    private final JdbcTemplate db;
    private final PlatformAdminGuard guard;
    public PlatformAdminContentController(JdbcTemplate db,PlatformAdminGuard guard){this.db=db;this.guard=guard;}

    public record FactDraft(String key,String subject,String emoji,String en,String fil,
                            boolean explore,List<Integer> grades,String sourceTitle,String sourceUrl) {}
    public record ChoiceDraft(String en,String fil,boolean correct) {}
    public record QuizDraft(long factId,String en,String fil,String explanationEn,
                            String explanationFil,List<ChoiceDraft> choices) {}

    @GetMapping("/dashboard")
    public ResponseEntity<?> dashboard(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth){
        guard.require(auth);
        Map<String,Object> data=new LinkedHashMap<>();
        data.put("facts",db.queryForObject("SELECT count(*) FROM content_fact",Long.class));
        data.put("publishedFacts",db.queryForObject("SELECT count(*) FROM content_fact WHERE status='PUBLISHED'",Long.class));
        data.put("pendingFacts",db.queryForObject("SELECT count(*) FROM content_fact WHERE status='IN_REVIEW'",Long.class));
        data.put("quizzes",db.queryForObject("SELECT count(*) FROM quiz_question",Long.class));
        data.put("pendingQuizzes",db.queryForObject("SELECT count(*) FROM quiz_question WHERE status='IN_REVIEW'",Long.class));
        data.put("publishedQuizzes",db.queryForObject("SELECT count(*) FROM quiz_question WHERE status='PUBLISHED'",Long.class));
        return privateResponse(data);
    }
    @GetMapping("/facts/{id}")
    public ResponseEntity<?> fact(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,@PathVariable long id){
        guard.require(auth);
        var found=db.query("""
            SELECT id,canonical_key,subject_code,emoji,status,created_by,verified_at
            FROM content_fact WHERE id=?
            """,(rs,n)->{
            Map<String,Object> item=new LinkedHashMap<>();
            item.put("id",rs.getLong(1));item.put("key",rs.getString(2));
            item.put("subject",rs.getString(3));item.put("emoji",rs.getString(4));
            item.put("status",rs.getString(5));item.put("createdBy",rs.getObject(6));
            item.put("verified",rs.getTimestamp(7)!=null);
            return item;
        },id);
        if(found.isEmpty())throw missing();
        Map<String,Object> result=found.get(0);
        result.put("translations",db.query("SELECT locale,body FROM content_fact_translation WHERE fact_id=?",
            (rs,n)->Map.of("locale",rs.getString(1),"body",rs.getString(2)),id));
        result.put("audiences",db.query("SELECT audience,grade_level FROM content_fact_audience WHERE fact_id=?",
            (rs,n)->{Map<String,Object> row=new LinkedHashMap<>();row.put("audience",rs.getString(1));row.put("grade",rs.getObject(2));return row;},id));
        result.put("sources",db.query("SELECT id,source_title,source_url,checked_at FROM content_source WHERE fact_id=?",
            (rs,n)->{Map<String,Object> row=new LinkedHashMap<>();row.put("id",rs.getLong(1));
                row.put("title",rs.getString(2));row.put("url",rs.getString(3));
                row.put("checked",rs.getTimestamp(4)!=null);return row;},id));
        return privateResponse(result);
    }

    @GetMapping("/quizzes")
    public ResponseEntity<?> quizzes(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                     @RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="30") int limit){
        guard.require(auth);checkPaging(offset,limit);
        return privateResponse(db.query("""
            SELECT q.id,q.fact_id,q.status,COALESCE(t.prompt,'') FROM quiz_question q
            LEFT JOIN quiz_question_translation t ON t.question_id=q.id AND t.locale='en'
            ORDER BY q.id DESC LIMIT ? OFFSET ?
            """,(rs,n)->Map.of("id",rs.getLong(1),"factId",rs.getLong(2),
            "status",rs.getString(3),"prompt",rs.getString(4)),limit,offset));
    }
    @GetMapping("/quizzes/{id}")
    public ResponseEntity<?> quiz(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                  @PathVariable long id) {
        guard.require(auth);
        var quiz=db.query("SELECT id,fact_id,status FROM quiz_question WHERE id=?",
            (rs,n)->{
                Map<String,Object> item=new LinkedHashMap<>();
                item.put("id",rs.getLong(1));item.put("factId",rs.getLong(2));
                item.put("status",rs.getString(3));return item;
            },id).stream().findFirst().orElseThrow(PlatformAdminContentController::missing);
        quiz.put("translations",db.query("""
            SELECT locale,prompt,explanation FROM quiz_question_translation WHERE question_id=?
            """,(rs,n)->Map.of("locale",rs.getString(1),"prompt",rs.getString(2),
                               "explanation",rs.getString(3)),id));
        quiz.put("choices",db.query("""
            SELECT o.id,o.position,o.correct,
                   MAX(CASE WHEN t.locale='en' THEN t.body END) AS en,
                   MAX(CASE WHEN t.locale='fil' THEN t.body END) AS fil
            FROM quiz_option o LEFT JOIN quiz_option_translation t ON t.option_id=o.id
            WHERE o.question_id=? GROUP BY o.id,o.position,o.correct ORDER BY o.position
            """,(rs,n)->{
                Map<String,Object> item=new LinkedHashMap<>();
                item.put("en",rs.getString("en"));item.put("fil",rs.getString("fil"));
                item.put("correct",rs.getBoolean("correct"));return item;
            },id));
        return privateResponse(quiz);
    }

    @Transactional
    @PostMapping("/quizzes")
    public ResponseEntity<?> createQuiz(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,@RequestBody QuizDraft payload){
        var user=guard.require(auth);PlatformAdminGuard.requireEdit(user);checkQuiz(payload);
        Integer factCount=db.queryForObject("SELECT count(*) FROM content_fact WHERE id=?",Integer.class,payload.factId());
        if(factCount==null||factCount!=1)throw bad("Fact does not exist");
        Long id=db.queryForObject("""
            INSERT INTO quiz_question(fact_id,status,created_by) VALUES (?,'DRAFT',?) RETURNING id
            """,Long.class,payload.factId(),user.id());
        writeQuiz(id,payload);
        event("QUIZ",id,"CREATE",user.id(),null,"DRAFT",null);
        return privateResponse(Map.of("id",id,"status","DRAFT"));
    }
    @Transactional
    @PutMapping("/quizzes/{id}")
    public ResponseEntity<?> updateQuiz(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String auth,
                                        @PathVariable long id,@RequestBody QuizDraft payload){
        var user=guard.require(auth);PlatformAdminGuard.requireEdit(user);checkQuiz(payload);
        int n=db.update("UPDATE quiz_question SET fact_id=? WHERE id=? AND status='DRAFT'",payload.factId(),id);
        if(n!=1)throw conflict("Only draft quizzes can be edited");
        db.update("DELETE FROM quiz_option WHERE question_id=?",id);
        db.update("DELETE FROM quiz_question_translation WHERE question_id=?",id);
        writeQuiz(id,payload);
        event("QUIZ",id,"UPDATE",user.id(),"DRAFT","DRAFT",null);
        return privateResponse(Map.of("id",id,"status","DRAFT"));
    }

    private void writeFact(long id,FactDraft p) {
        for(var e:Map.of("en",p.en(),"fil",p.fil()).entrySet())
            db.update("INSERT INTO content_fact_translation(fact_id,locale,body) VALUES (?,?,?)",id,e.getKey(),e.getValue().trim());
        if(p.explore())db.update("INSERT INTO content_fact_audience(fact_id,audience,grade_level) VALUES (?,'EXPLORE',NULL)",id);
        for(int grade:p.grades())db.update("INSERT INTO content_fact_audience(fact_id,audience,grade_level) VALUES (?,'STUDENT',?)",id,grade);
        db.update("INSERT INTO content_source(fact_id,source_title,source_url) VALUES (?,?,?)",
            id,p.sourceTitle().trim(),p.sourceUrl().trim());
    }
    private void writeQuiz(long id,QuizDraft p) {
        for(var e:Map.of("en",new String[]{p.en(),p.explanationEn()},
                          "fil",new String[]{p.fil(),p.explanationFil()}).entrySet())
            db.update("""
                INSERT INTO quiz_question_translation(question_id,locale,prompt,explanation)
                VALUES (?,?,?,?)
                """,id,e.getKey(),e.getValue()[0].trim(),e.getValue()[1].trim());
        for(int i=0;i<p.choices().size();i++){
            var choice=p.choices().get(i);
            Long option=db.queryForObject("""
                INSERT INTO quiz_option(question_id,position,correct) VALUES (?,?,?) RETURNING id
                """,Long.class,id,i,choice.correct());
            db.update("INSERT INTO quiz_option_translation(option_id,locale,body) VALUES (?,'en',?)",option,choice.en().trim());
            db.update("INSERT INTO quiz_option_translation(option_id,locale,body) VALUES (?,'fil',?)",option,choice.fil().trim());
        }
    }
    static void checkFact(FactDraft p) {
        if(p==null||!nonblank(p.key(),128)||!p.key().matches("[A-Za-z0-9_-]+")||
           !nonblank(p.subject(),40)||!p.subject().matches("[A-Za-z0-9_-]+")||
           !nonblank(p.en(),10000)||!nonblank(p.fil(),10000)||
           !nonblank(p.sourceTitle(),300)||!nonblank(p.sourceUrl(),2000)||
           !(p.sourceUrl().startsWith("https://")||p.sourceUrl().startsWith("http://"))||
           p.grades()==null||p.grades().size()>12||
           (!p.explore()&&p.grades().isEmpty())||
           p.grades().stream().anyMatch(g->g==null||g<1||g>12)||
           p.grades().stream().distinct().count()!=p.grades().size())throw bad("Invalid fact, audience or source");
    }
    static void checkQuiz(QuizDraft p) {
        if(p==null||p.factId()<1||!nonblank(p.en(),10000)||!nonblank(p.fil(),10000)||
           !nonblank(p.explanationEn(),10000)||!nonblank(p.explanationFil(),10000)||
           p.choices()==null||p.choices().size()<2||p.choices().size()>6||
           p.choices().stream().filter(c->c!=null&&c.correct()).count()!=1||
           p.choices().stream().anyMatch(c->c==null||!nonblank(c.en(),1000)||!nonblank(c.fil(),1000)))
           throw bad("Quiz requires 2–6 bilingual options and exactly one correct answer");
    }
    static boolean nonblank(String value,int max){return value!=null&&!value.isBlank()&&value.length()<=max;}
    static void checkPaging(int offset,int limit){if(offset<0||limit<1||limit>100)throw bad("Invalid pagination");}
    static ResponseStatusException bad(String detail){return new ResponseStatusException(HttpStatus.BAD_REQUEST,detail);}
    static ResponseStatusException conflict(String detail){return new ResponseStatusException(HttpStatus.CONFLICT,detail);}
    static ResponseStatusException missing(){return new ResponseStatusException(HttpStatus.NOT_FOUND,"Content not found");}
    private void event(String type,long id,String action,UUID actor,String from,String to,String details){
        db.update("""
            INSERT INTO editorial_event(entity_type,entity_id,action,actor_id,from_status,to_status,details)
            VALUES (?,?,?,?,?,?,?)
            """,type,id,action,actor,from,to,details);
    }
    private static <T> ResponseEntity<T> privateResponse(T value){
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
    }
}
