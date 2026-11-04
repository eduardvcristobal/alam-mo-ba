package com.alammoba.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

/** Registered learners may request privacy help without sharing personal data with admins. */
@RestController
@RequestMapping("/api/v1/account/privacy-requests")
public class AccountPrivacyRequestController {
    private final JdbcTemplate jdbc;
    private final AccountIdentityController identity;
    public AccountPrivacyRequestController(JdbcTemplate jdbc,AccountIdentityController identity){
        this.jdbc=jdbc;this.identity=identity;
    }
    public record Request(String type){}
    @GetMapping
    public org.springframework.http.ResponseEntity<List<Map<String,Object>>> list(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer){
        UUID account=identity.accountFromHeader(bearer);
        return AdminContentController.privateResponse(jdbc.query("""
          SELECT id,request_type,status,created_at
          FROM learning_privacy_request WHERE account_id=? ORDER BY created_at DESC LIMIT 50
          """,(rs,i)->Map.<String,Object>of("id",rs.getLong(1),"type",rs.getString(2),
             "status",rs.getString(3),"createdAt",rs.getTimestamp(4).toInstant().toString()),account));
    }
    @Transactional
    @PostMapping
    public org.springframework.http.ResponseEntity<Map<String,Object>> create(
      @RequestHeader(value=HttpHeaders.AUTHORIZATION,required=false) String bearer,
      @RequestBody Request input){
        UUID account=identity.accountFromHeader(bearer);
        if(input==null||!(input.type().equals("EXPORT")||input.type().equals("DELETE")))
            throw AdminContentController.bad("Privacy request must be EXPORT or DELETE");
        Integer existing=jdbc.queryForObject("""
          SELECT count(*) FROM learning_privacy_request
          WHERE account_id=? AND request_type=? AND status IN ('OPEN','IN_REVIEW')
          """,Integer.class,account,input.type());
        if(existing!=null&&existing>0)throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.CONFLICT,"An active request already exists");
        Long id=jdbc.queryForObject("""
          INSERT INTO learning_privacy_request(account_id,request_type) VALUES (?,?) RETURNING id
          """,Long.class,account,input.type());
        return AdminContentController.privateResponse(Map.of("id",id,"status","OPEN"));
    }
}
