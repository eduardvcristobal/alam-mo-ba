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

/** Quiz question bank. Correct answers are never exposed by the public API. */
@RestController
@RequestMapping("/api/v1/admin/questions")
public class AdminQuizController {
    private final JdbcTemplate jdbc;
    private final AdminAccess access;
    public AdminQuizController(JdbcTemplate jdbc,AdminAccess access){this.jdbc=jdbc;this.access=access;}
    public record OptionDraft(String en,String fil,boolean correct){}
    public record QuestionDraft(long factId,String en,String fil,String explanationEn,
                                String explanationFil,List<OptionDraft> options){}
    @GetMapping
    public ResponseEntity<List<Map<String,Object>>> list(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
      @RequestParam(defaultValue="50") int limit){
        access.require(bearer);
        if(limit<1||limit>100)throw AdminContentController.bad("Invalid limit");
        return AdminContentController.privateResponse(jdbc.query("""
            SELECT q.id,q.fact_id,q.status,
              (SELECT t.prompt FROM quiz_question_translation t WHERE t.question_id=q.id AND t.locale='en')
            FROM quiz_question q ORDER BY q.id DESC LIMIT ?
            """,(rs,i)->Map.<String,Object>of("id",rs.getLong(1),"factId",rs.getLong(2),
               "status",rs.getString(3),"prompt",rs.getString(4)==null?"":rs.getString(4)),limit));
    }
    @GetMapping("/{id}")
    public ResponseEntity<Map<String,Object>> detail(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,@PathVariable long id){
        access.require(bearer);
        var questions=jdbc.query("SELECT fact_id,status FROM quiz_question WHERE id=?",
          (rs,i)->Map.<String,Object>of("factId",rs.getLong(1),"status",rs.getString(2)),id);
        if(questions.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var out=new java.util.LinkedHashMap<String,Object>(questions.get(0));
        out.put("id",id);
        out.put("translations",jdbc.query("""
            SELECT locale,prompt,explanation FROM quiz_question_translation WHERE question_id=? ORDER BY locale
            """,(rs,i)->Map.of("locale",rs.getString(1),"prompt",rs.getString(2),"explanation",rs.getString(3)),id));
        out.put("options",jdbc.query("""
            SELECT o.id,o.position,o.correct,
              COALESCE(en.body,''),COALESCE(fil.body,'')
            FROM quiz_option o
            LEFT JOIN quiz_option_translation en ON en.option_id=o.id AND en.locale='en'
            LEFT JOIN quiz_option_translation fil ON fil.option_id=o.id AND fil.locale='fil'
            WHERE o.question_id=? ORDER BY o.position
            """,(rs,i)->Map.of("id",rs.getLong(1),"position",rs.getInt(2),
                 "correct",rs.getBoolean(3),"en",rs.getString(4),"fil",rs.getString(5)),id));
        return AdminContentController.privateResponse(out);
    }
    @Transactional
    @PostMapping
    public ResponseEntity<Map<String,Object>> create(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,@RequestBody QuestionDraft input){
        UUID actor=access.require(bearer,"EDITOR","CONTENT_ADMIN");
        validate(input);
        ensureFact(input.factId());
        Long id=jdbc.queryForObject("""
            INSERT INTO quiz_question(fact_id,status,created_by) VALUES (?,'DRAFT',?) RETURNING id
            """,Long.class,input.factId(),actor);
        write(id,input);
        access.audit(actor,"CREATE","QUESTION",id);
        return AdminContentController.privateResponse(Map.of("id",id,"status","DRAFT"));
    }
    @Transactional
    @PutMapping("/{id}")
    public ResponseEntity<Map<String,Object>> update(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
      @PathVariable long id,@RequestBody QuestionDraft input){
        UUID actor=access.require(bearer,"EDITOR","CONTENT_ADMIN");
        validate(input);
        ensureFact(input.factId());
        int n=jdbc.update("""
            UPDATE quiz_question SET fact_id=?,status='DRAFT',reviewed_by=NULL,
                reviewed_at=NULL,published_by=NULL,published_at=NULL
            WHERE id=? AND status IN ('DRAFT','IN_REVIEW','APPROVED')
            """,input.factId(),id);
        if(n!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"Question is not editable");
        jdbc.update("DELETE FROM quiz_option WHERE question_id=?",id);
        jdbc.update("DELETE FROM quiz_question_translation WHERE question_id=?",id);
        write(id,input);
        access.audit(actor,"EDIT","QUESTION",id);
        return AdminContentController.privateResponse(Map.of("id",id,"status","DRAFT"));
    }
    @Transactional
    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String,Object>> deleteDraft(
        @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,@PathVariable long id){
        UUID actor=access.require(bearer,"EDITOR","CONTENT_ADMIN");
        int changed=jdbc.update("DELETE FROM quiz_question WHERE id=? AND status='DRAFT'",id);
        if(changed!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"Only draft questions can be deleted");
        access.audit(actor,"DELETE_DRAFT","QUESTION",id);
        return AdminContentController.privateResponse(Map.of("id",id,"deleted",true));
    }

    private void write(long id,QuestionDraft q){
        jdbc.update("INSERT INTO quiz_question_translation(question_id,locale,prompt,explanation) VALUES (?,'en',?,?)",
          id,q.en().trim(),q.explanationEn().trim());
        jdbc.update("INSERT INTO quiz_question_translation(question_id,locale,prompt,explanation) VALUES (?,'fil',?,?)",
          id,q.fil().trim(),q.explanationFil().trim());
        for(int i=0;i<q.options().size();i++){
            OptionDraft option=q.options().get(i);
            Long optionId=jdbc.queryForObject("""
                INSERT INTO quiz_option(question_id,position,correct) VALUES (?,?,?) RETURNING id
                """,Long.class,id,i,option.correct());
            jdbc.update("INSERT INTO quiz_option_translation(option_id,locale,body) VALUES (?,'en',?)",optionId,option.en().trim());
            jdbc.update("INSERT INTO quiz_option_translation(option_id,locale,body) VALUES (?,'fil',?)",optionId,option.fil().trim());
        }
    }
    private void ensureFact(long id){
        Integer count=jdbc.queryForObject("SELECT count(*) FROM content_fact WHERE id=? AND status<>'RETIRED'",Integer.class,id);
        if(count==null||count!=1)throw AdminContentController.bad("A valid, non-retired fact is required");
    }
    static void validate(QuestionDraft q){
        if(q==null||q.factId()<1||!valid(q.en())||!valid(q.fil())||
           !valid(q.explanationEn())||!valid(q.explanationFil())||
           q.options()==null||q.options().size()<2||q.options().size()>6 ||
           q.options().stream().filter(o->o!=null&&o.correct()).count()!=1 ||
           q.options().stream().anyMatch(o->o==null||!valid(o.en())||!valid(o.fil())))
            throw AdminContentController.bad("Bilingual question needs 2–6 options and exactly one correct answer");
    }
    private static boolean valid(String s){return s!=null&&!s.isBlank()&&s.length()<=4000;}
}
