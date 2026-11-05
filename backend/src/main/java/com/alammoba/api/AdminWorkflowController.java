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

/** Draft -> In Review -> Approved -> Published, with mandatory role separation and audits. */
@RestController
@RequestMapping("/api/v1/admin/workflow")
public class AdminWorkflowController {
    private final JdbcTemplate jdbc;
    private final AdminAccess access;
    public AdminWorkflowController(JdbcTemplate jdbc,AdminAccess access) {
        this.jdbc=jdbc;this.access=access;
    }
    @GetMapping("/queue")
    public ResponseEntity<List<Map<String,Object>>> queue(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer) {
        access.require(bearer,"REVIEWER","CONTENT_ADMIN");
        return AdminContentController.privateResponse(jdbc.query("""
            SELECT entity_type,id,status FROM (
               SELECT 'FACT' entity_type,id,status FROM content_fact WHERE status IN ('IN_REVIEW','APPROVED')
               UNION ALL
               SELECT 'QUESTION' entity_type,id,status FROM quiz_question WHERE status IN ('IN_REVIEW','APPROVED')
            ) w ORDER BY entity_type,id LIMIT 100
            """,(rs,i)->Map.<String,Object>of("type",rs.getString(1),"id",rs.getLong(2),"status",rs.getString(3))));
    }
    /** A reviewer must explicitly confirm that they inspected the cited HTTPS source. */
    @Transactional
    @PostMapping("/fact/{id}/verify-source")
    public ResponseEntity<Map<String,Object>> verifySource(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
      @PathVariable long id) {
        UUID reviewer=access.require(bearer,"REVIEWER");
        var rows=jdbc.query("SELECT status,created_by FROM content_fact WHERE id=? FOR UPDATE",
            (rs,i)->new State(rs.getString(1),rs.getObject(2,UUID.class),null),id);
        if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        State fact=rows.get(0);
        if(!fact.status().equals("IN_REVIEW"))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Source verification requires in-review content");
        if(fact.author()==null || reviewer.equals(fact.author()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Independent source reviewer required");
        if(!exists("SELECT 1 FROM content_source WHERE fact_id=? AND source_url LIKE 'https://%' AND length(trim(source_title))>0",id))
            throw AdminContentController.bad("HTTPS source is required");
        jdbc.update("UPDATE content_source SET checked_at=NOW() WHERE fact_id=? AND checked_at IS NULL",id);
        access.audit(reviewer,"VERIFY_SOURCE","FACT",id);
        return AdminContentController.privateResponse(Map.of("id",id,"sourceVerified",true));
    }

    @Transactional
    @PostMapping("/{type}/{id}/{action}")
    public ResponseEntity<Map<String,Object>> transition(
       @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
       @PathVariable String type,@PathVariable long id,@PathVariable String action) {
        if(id<1)throw AdminContentController.bad("Invalid content ID");
        if(!type.equals("fact")&&!type.equals("question"))throw AdminContentController.bad("Invalid type");
        String table=type.equals("fact")?"content_fact":"quiz_question";
        UUID actor;
        String from;
        String to;
        switch(action) {
            case "submit" -> {actor=access.require(bearer,"EDITOR","CONTENT_ADMIN");from="DRAFT";to="IN_REVIEW";}
            case "approve" -> {actor=access.require(bearer,"REVIEWER");from="IN_REVIEW";to="APPROVED";}
            case "reject" -> {actor=access.require(bearer,"REVIEWER");from="IN_REVIEW";to="DRAFT";}
            case "publish" -> {actor=access.require(bearer,"CONTENT_ADMIN");from="APPROVED";to="PUBLISHED";}
            case "retire" -> {actor=access.require(bearer,"CONTENT_ADMIN");from="PUBLISHED";to="RETIRED";}
            case "republish" -> {actor=access.require(bearer,"CONTENT_ADMIN");from="RETIRED";to="PUBLISHED";}
            default -> throw AdminContentController.bad("Invalid workflow action");
        }
        var records=jdbc.query("SELECT status,created_by,reviewed_by FROM "+table+" WHERE id=? FOR UPDATE",
           (rs,i)->new State(rs.getString(1),rs.getObject(2,UUID.class),rs.getObject(3,UUID.class)),id);
        if(records.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Content missing");
        State current=records.get(0);
        if(!current.status().equals(from))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Expected "+from+" but found "+current.status());
        if(action.equals("approve") && (actor.equals(current.author()) || current.author()==null))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Authors cannot approve their own work. A different account with the REVIEWER or SUPER_ADMIN role must approve it.");
        if((action.equals("publish")||action.equals("republish")) && (current.reviewer()==null || current.reviewer().equals(current.author())))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"An independent review is required");
        if(action.equals("approve"))verifyDraft(type,id);
        if(action.equals("publish")||action.equals("republish"))verifyPublish(type,id);
        int changed;
        if(action.equals("approve")) {
            changed=jdbc.update("UPDATE "+table+" SET status='APPROVED',reviewed_by=?,reviewed_at=NOW() WHERE id=? AND status='IN_REVIEW'",
                actor,id);
            if(type.equals("fact"))jdbc.update("UPDATE content_fact SET verified_at=NOW() WHERE id=?",id);
        } else if(action.equals("publish")||action.equals("republish")) {
            changed=jdbc.update("UPDATE "+table+" SET status='PUBLISHED',published_by=?,published_at=NOW() WHERE id=? AND status=?",
                actor,id,from);
        } else {
            changed=jdbc.update("UPDATE "+table+" SET status=? WHERE id=? AND status=?",to,id,from);
            if(action.equals("reject"))jdbc.update("UPDATE "+table+" SET reviewed_by=NULL,reviewed_at=NULL WHERE id=?",id);
        }
        if(changed!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"Content updated concurrently");
        access.audit(actor,action.toUpperCase(),type.toUpperCase(),id);
        return AdminContentController.privateResponse(Map.of("id",id,"status",to));
    }
    private void verifyDraft(String type,long id) {
        if(type.equals("fact")) {
            if(!exists("SELECT 1 FROM content_fact_translation WHERE fact_id=? AND locale='en' AND length(trim(body))>0",id))
                throw AdminContentController.bad("Fact is missing its English text");
            if(!exists("SELECT 1 FROM content_fact_translation WHERE fact_id=? AND locale='fil' AND length(trim(body))>0",id))
                throw AdminContentController.bad("Fact is missing its Filipino translation");
            if(!exists("SELECT 1 FROM content_fact_audience WHERE fact_id=?",id))
                throw AdminContentController.bad("Fact must be assigned to at least one audience");
            if(!exists("SELECT 1 FROM content_source WHERE fact_id=? AND source_url LIKE 'https://%' AND length(trim(source_title))>0",id))
                throw AdminContentController.bad("Fact needs a titled HTTPS source");
            if(!exists("SELECT 1 FROM content_source WHERE fact_id=? AND source_url LIKE 'https://%' AND length(trim(source_title))>0 AND checked_at IS NOT NULL",id))
                throw AdminContentController.bad("Source has not been independently checked. Click Verify source and complete the confirmation first.");
        } else {
            if(!exists("SELECT 1 FROM quiz_question_translation WHERE question_id=? AND locale='en'",id)||
               !exists("SELECT 1 FROM quiz_question_translation WHERE question_id=? AND locale='fil'",id)||
               count("SELECT count(*) FROM quiz_option WHERE question_id=?",id)<2 ||
               count("SELECT count(*) FROM quiz_option WHERE question_id=? AND correct=true",id)!=1 ||
               !exists("SELECT 1 FROM quiz_option o JOIN quiz_option_translation t ON t.option_id=o.id WHERE o.question_id=? AND t.locale='en'",id)||
               !exists("SELECT 1 FROM quiz_option o JOIN quiz_option_translation t ON t.option_id=o.id WHERE o.question_id=? AND t.locale='fil'",id))
                throw AdminContentController.bad("Quiz requires bilingual question, options and exactly one answer");
        }
    }
    private void verifyPublish(String type,long id) {
        if(type.equals("fact")) {
            verifyDraft(type,id);
            if(!exists("SELECT 1 FROM content_fact WHERE id=? AND verified_at IS NOT NULL",id)||
               !exists("SELECT 1 FROM content_source WHERE fact_id=? AND checked_at IS NOT NULL",id))
                throw AdminContentController.bad("Facts must be source-checked before publication");
        } else {
            verifyDraft(type,id);
            if(!exists("""
                SELECT 1 FROM quiz_question q JOIN content_fact f ON f.id=q.fact_id
                WHERE q.id=? AND f.status='PUBLISHED' AND f.verified_at IS NOT NULL
                """,id))
                throw AdminContentController.bad("Publish and verify the linked fact before this quiz");
        }
    }
    private boolean exists(String sql,long id){return !jdbc.query(sql,(rs,i)->rs.getInt(1),id).isEmpty();}
    private long count(String sql,long id){return jdbc.queryForObject(sql,Long.class,id);}
    record State(String status,UUID author,UUID reviewer){}
}
