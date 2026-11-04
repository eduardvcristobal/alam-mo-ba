package com.alammoba.api;

import java.util.LinkedHashMap;
import java.util.List;
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

/** M1.3 editorial fact management. Public endpoints are unaffected. */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminContentController {
    private final JdbcTemplate jdbc;
    private final AdminAccess access;
    public AdminContentController(JdbcTemplate jdbc,AdminAccess access){this.jdbc=jdbc;this.access=access;}

    public record FactDraft(String key,String subject,String emoji,String en,String fil,
                            boolean student,Integer grade,boolean explore,String sourceTitle,String sourceUrl){}
    public record Overview(long facts,long published,long questions,long reviews){}
    public record AdminMe(UUID accountId,List<String> roles){}

    @GetMapping("/me")
    public ResponseEntity<AdminMe> me(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer){
        UUID actor=access.require(bearer);
        return privateResponse(new AdminMe(actor,access.roles(actor)));
    }
    @GetMapping("/overview")
    public ResponseEntity<Overview> overview(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer){
        access.require(bearer);
        return privateResponse(new Overview(
            number("SELECT count(*) FROM content_fact"),
            number("SELECT count(*) FROM content_fact WHERE status='PUBLISHED'"),
            number("SELECT count(*) FROM quiz_question"),
            number("SELECT (SELECT count(*) FROM content_fact WHERE status='IN_REVIEW')+(SELECT count(*) FROM quiz_question WHERE status='IN_REVIEW')")
        ));
    }
    @GetMapping("/facts")
    public ResponseEntity<List<Map<String,Object>>> list(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
        @RequestParam(defaultValue="50") int limit,@RequestParam(defaultValue="0") int offset){
        access.require(bearer);
        if(limit<1||limit>100||offset<0)throw bad("Invalid pagination");
        return privateResponse(jdbc.query("""
            SELECT f.id,f.canonical_key,f.subject_code,f.emoji,f.status, en.body,fil.body,
                (SELECT s.source_url FROM content_source s WHERE s.fact_id=f.id ORDER BY s.id LIMIT 1) source_url
            FROM content_fact f
            LEFT JOIN content_fact_translation en ON en.fact_id=f.id AND en.locale='en'
            LEFT JOIN content_fact_translation fil ON fil.fact_id=f.id AND fil.locale='fil'
            ORDER BY f.id DESC LIMIT ? OFFSET ?
            """,(rs,i)->{
                Map<String,Object> out=new LinkedHashMap<>();
                out.put("id",rs.getLong(1));out.put("key",rs.getString(2));
                out.put("subject",rs.getString(3));out.put("emoji",rs.getString(4));
                out.put("status",rs.getString(5));out.put("en",rs.getString(6));
                out.put("fil",rs.getString(7));out.put("sourceUrl",rs.getString(8));
                return out;
            },limit,offset));
    }
    @Transactional
    @PostMapping("/facts")
    public ResponseEntity<Map<String,Object>> create(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
                                                      @RequestBody FactDraft input){
        UUID actor=access.require(bearer,"EDITOR","CONTENT_ADMIN");
        validate(input);
        Long id=jdbc.queryForObject("""
            INSERT INTO content_fact(canonical_key,subject_code,emoji,status,created_by)
            VALUES (?,?,?,'DRAFT',?) RETURNING id
            """,Long.class,input.key().trim(),input.subject(),input.emoji(),actor);
        writeDetails(id,input);
        access.audit(actor,"CREATE","FACT",id);
        return privateResponse(Map.of("id",id,"status","DRAFT"));
    }
    @Transactional
    @PutMapping("/facts/{id}")
    public ResponseEntity<Map<String,Object>> edit(@RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
                                                    @PathVariable long id,@RequestBody FactDraft input){
        UUID actor=access.require(bearer,"EDITOR","CONTENT_ADMIN");
        validate(input);
        int changed=jdbc.update("""
            UPDATE content_fact
            SET canonical_key=?,subject_code=?,emoji=?,status='DRAFT',verified_at=NULL,
                reviewed_at=NULL,reviewed_by=NULL,published_at=NULL,published_by=NULL,updated_at=NOW()
            WHERE id=? AND status IN ('DRAFT','IN_REVIEW','APPROVED')
            """,input.key().trim(),input.subject(),input.emoji(),id);
        if(changed!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"Fact not editable in current state");
        jdbc.update("DELETE FROM content_fact_translation WHERE fact_id=?",id);
        jdbc.update("DELETE FROM content_fact_audience WHERE fact_id=?",id);
        jdbc.update("DELETE FROM content_source WHERE fact_id=?",id);
        writeDetails(id,input);
        access.audit(actor,"EDIT","FACT",id);
        return privateResponse(Map.of("id",id,"status","DRAFT"));
    }
    private void writeDetails(Long id,FactDraft f){
        jdbc.update("INSERT INTO content_fact_translation(fact_id,locale,body) VALUES (?,'en',?)",id,f.en().trim());
        jdbc.update("INSERT INTO content_fact_translation(fact_id,locale,body) VALUES (?,'fil',?)",id,f.fil().trim());
        if(f.student())jdbc.update("INSERT INTO content_fact_audience(fact_id,audience,grade_level) VALUES (?,'STUDENT',?)",id,f.grade());
        if(f.explore())jdbc.update("INSERT INTO content_fact_audience(fact_id,audience,grade_level) VALUES (?,'EXPLORE',NULL)",id);
        if(notBlank(f.sourceTitle()) && notBlank(f.sourceUrl()))
            jdbc.update("INSERT INTO content_source(fact_id,source_title,source_url) VALUES (?,?,?)",
                id,f.sourceTitle().trim(),f.sourceUrl().trim());
    }
    static void validate(FactDraft f) {
        if(f==null || !notBlank(f.key()) || f.key().length()>128 ||
           !f.key().matches("[a-z0-9-]+") || !notBlank(f.subject()) ||
           !f.subject().matches("[A-Za-z0-9_-]{1,40}") ||
           !notBlank(f.en()) || !notBlank(f.fil()) ||
           f.en().length()>4000 || f.fil().length()>4000 ||
           !(f.student()||f.explore()) || (f.student()&&(f.grade()==null||f.grade()<1||f.grade()>12)) ||
           (f.emoji()!=null&&f.emoji().length()>24) ||
           (notBlank(f.sourceUrl()) && (!f.sourceUrl().startsWith("https://") || f.sourceUrl().length()>2000)) ||
           (notBlank(f.sourceTitle())!=notBlank(f.sourceUrl())))
            throw bad("Invalid bilingual fact, audience, subject or source");
    }
    static boolean notBlank(String s){return s!=null&&!s.isBlank();}
    static ResponseStatusException bad(String msg){return new ResponseStatusException(HttpStatus.BAD_REQUEST,msg);}
    private long number(String sql){return jdbc.queryForObject(sql,Long.class);}
    static <T> ResponseEntity<T> privateResponse(T data){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data);}
}
