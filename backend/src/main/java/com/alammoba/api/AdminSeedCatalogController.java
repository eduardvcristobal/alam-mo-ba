package com.alammoba.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Database-backed catalog of reviewed starter drafts available to platform editors. */
@RestController
@RequestMapping("/api/v1/admin/seed-catalog")
public class AdminSeedCatalogController {
    private final JdbcTemplate jdbc;
    private final AdminAccess access;
    private final ObjectMapper mapper;

    public AdminSeedCatalogController(JdbcTemplate jdbc, AdminAccess access, ObjectMapper mapper) {
        this.jdbc=jdbc;this.access=access;this.mapper=mapper;
    }

    @GetMapping
    public ResponseEntity<List<Map<String,Object>>> catalog(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer) {
        access.require(bearer,"SUPER_ADMIN","EDITOR","CONTENT_ADMIN");
        return AdminContentController.privateResponse(jdbc.query("""
            SELECT c.content_key,c.title,c.category,c.subject_code,c.grade_level,c.emoji,c.fact_en,c.fact_fil,
                   c.source_title,c.quiz_en,c.quiz_fil
            FROM starter_content_catalog c
            WHERE c.active=TRUE
              AND NOT EXISTS (
                SELECT 1 FROM content_fact f
                WHERE f.canonical_key=c.content_key
                   OR EXISTS (
                     SELECT 1 FROM content_fact_translation t
                     WHERE t.fact_id=f.id AND (
                       (t.locale='en' AND lower(btrim(t.body))=lower(btrim(c.fact_en))) OR
                       (t.locale='fil' AND lower(btrim(t.body))=lower(btrim(c.fact_fil)))
                     )
                   )
              )
            ORDER BY c.category,c.title
            """,(rs,i)->Map.<String,Object>ofEntries(
                Map.entry("id",rs.getString(1)),Map.entry("title",rs.getString(2)),
                Map.entry("category",rs.getString(3)),Map.entry("subject",rs.getString(4)),
                Map.entry("grade",rs.getInt(5)),Map.entry("emoji",rs.getString(6)),
                Map.entry("factEn",rs.getString(7)),Map.entry("factFil",rs.getString(8)),
                Map.entry("sourceTitle",rs.getString(9)),Map.entry("quizEn",rs.getString(10)),
                Map.entry("quizFil",rs.getString(11)))));
    }

    public record SeedRequest(List<String> ids) {}
    public record SeedResult(int factsCreated,int quizzesCreated,int skipped) {}

    @Transactional
    @PostMapping("/seed")
    public ResponseEntity<SeedResult> seed(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
      @RequestBody SeedRequest request) {
        UUID actor=access.require(bearer,"SUPER_ADMIN","EDITOR","CONTENT_ADMIN");
        if(request==null||request.ids()==null||request.ids().isEmpty()||request.ids().size()>250)
            throw AdminContentController.bad("Select between 1 and 250 catalog items");
        int facts=0,quizzes=0,skipped=0;
        for(String key:request.ids().stream().distinct().toList()) {
            var rows=jdbc.query("""
                SELECT content_key,subject_code,emoji,grade_level,fact_en,fact_fil,source_title,source_url,
                       quiz_en,quiz_fil,explanation_en,explanation_fil,options::text
                FROM starter_content_catalog WHERE content_key=? AND active=TRUE
                """,(rs,i)->new CatalogItem(rs.getString(1),rs.getString(2),rs.getString(3),rs.getInt(4),
                  rs.getString(5),rs.getString(6),rs.getString(7),rs.getString(8),rs.getString(9),
                  rs.getString(10),rs.getString(11),rs.getString(12),rs.getString(13)),key);
            if(rows.isEmpty())throw AdminContentController.bad("Unknown starter catalog item");
            CatalogItem item=rows.get(0);
            Long factId=jdbc.query("SELECT id FROM content_fact WHERE canonical_key=?",(rs,i)->rs.getLong(1),item.key())
                .stream().findFirst().orElse(null);
            if(factId==null) {
                factId=jdbc.queryForObject("""
                    INSERT INTO content_fact(canonical_key,subject_code,emoji,status,created_by)
                    VALUES (?,?,?,'DRAFT',?) RETURNING id
                    """,Long.class,item.key(),item.subject(),item.emoji(),actor);
                jdbc.update("INSERT INTO content_fact_translation(fact_id,locale,body) VALUES (?,'en',?),(?,'fil',?)",
                    factId,item.factEn(),factId,item.factFil());
                jdbc.update("INSERT INTO content_fact_audience(fact_id,audience,grade_level) VALUES (?,'STUDENT',?),(?,'EXPLORE',NULL)",
                    factId,item.grade(),factId);
                jdbc.update("INSERT INTO content_source(fact_id,source_title,source_url) VALUES (?,?,?)",
                    factId,item.sourceTitle(),item.sourceUrl());
                access.audit(actor,"SEED","FACT",factId);facts++;
            }
            Long linkedFactId=factId;
            if(jdbc.queryForObject("SELECT count(*) FROM quiz_question WHERE fact_id=?",Integer.class,linkedFactId)>0) {
                skipped++;continue;
            }
            Long questionId=jdbc.queryForObject("INSERT INTO quiz_question(fact_id,status,created_by) VALUES (?,'DRAFT',?) RETURNING id",
                Long.class,linkedFactId,actor);
            jdbc.update("INSERT INTO quiz_question_translation(question_id,locale,prompt,explanation) VALUES (?,'en',?,?),(?,'fil',?,?)",
                questionId,item.quizEn(),item.explanationEn(),questionId,item.quizFil(),item.explanationFil());
            try {
                JsonNode options=mapper.readTree(item.options());
                for(int position=0;position<options.size();position++) {
                    JsonNode option=options.get(position);
                    Long optionId=jdbc.queryForObject("INSERT INTO quiz_option(question_id,position,correct) VALUES (?,?,?) RETURNING id",
                        Long.class,questionId,position,option.path("correct").asBoolean());
                    jdbc.update("INSERT INTO quiz_option_translation(option_id,locale,body) VALUES (?,'en',?),(?,'fil',?)",
                        optionId,option.path("en").asText(),optionId,option.path("fil").asText());
                }
            } catch(Exception e) {
                throw AdminContentController.bad("Starter quiz options are invalid");
            }
            access.audit(actor,"SEED","QUESTION",questionId);quizzes++;
        }
        return AdminContentController.privateResponse(new SeedResult(facts,quizzes,skipped));
    }

    private record CatalogItem(String key,String subject,String emoji,int grade,String factEn,String factFil,
      String sourceTitle,String sourceUrl,String quizEn,String quizFil,String explanationEn,String explanationFil,String options) {}
}
