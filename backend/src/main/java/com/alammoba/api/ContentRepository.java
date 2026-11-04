package com.alammoba.api;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

@Repository
public class ContentRepository {
  private final JdbcTemplate jdbc;
  public ContentRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
  public record Filter(String mode,Integer grade,String subject,int limit,int offset){
    public static Filter of(String mode,Integer grade,String subject,int limit,int offset){
      if(!"student".equals(mode)&&!"explore".equals(mode))throw invalid("mode must be student or explore");
      if(grade!=null&&(!"student".equals(mode)||grade<1||grade>12))throw invalid("invalid grade for mode");
      if(limit<1||limit>100||offset<0)throw invalid("limit must be 1–100, offset >= 0");
      if(subject!=null&&(subject.length()>40||!subject.matches("[A-Za-z0-9_-]+")))throw invalid("invalid subject");
      return new Filter(mode,grade,subject,limit,offset);
    }
    private static ResponseStatusException invalid(String msg){return new ResponseStatusException(HttpStatus.BAD_REQUEST,msg);}
  }
  private static final String FILTER=" FROM content_fact f WHERE f.status='PUBLISHED' AND f.verified_at IS NOT NULL "
     +"AND EXISTS(SELECT 1 FROM content_source s WHERE s.fact_id=f.id AND s.checked_at IS NOT NULL) "
     +"AND EXISTS(SELECT 1 FROM content_fact_audience a WHERE a.fact_id=f.id AND a.audience=? AND (CAST(? AS INTEGER) IS NULL OR a.grade_level=?)) "
     +"AND (CAST(? AS VARCHAR) IS NULL OR f.subject_code=?)";
  private Object[] args(Filter f){return new Object[]{f.mode.equals("student")?"STUDENT":"EXPLORE",f.grade,f.grade,f.subject,f.subject};}
  public long countFacts(Filter f){return jdbc.queryForObject("SELECT count(*)"+FILTER,Long.class,args(f));}
  public List<Map<String,Object>> facts(Filter f){
    Object[] params=Arrays.copyOf(args(f),7);params[5]=f.limit;params[6]=f.offset;
    return jdbc.query("SELECT f.id,f.canonical_key,f.subject_code,f.emoji"+FILTER+" ORDER BY f.id LIMIT ? OFFSET ?",(r,n)->fact(r),params);
  }
  public Optional<Map<String,Object>> fact(long id){
    String q="SELECT f.id,f.canonical_key,f.subject_code,f.emoji FROM content_fact f WHERE f.id=? AND f.status='PUBLISHED' AND f.verified_at IS NOT NULL AND EXISTS(SELECT 1 FROM content_source s WHERE s.fact_id=f.id AND s.checked_at IS NOT NULL)";
    return jdbc.query(q,(r,n)->fact(r),id).stream().findFirst();
  }
  private Map<String,Object> fact(ResultSet r)throws SQLException{
    long id=r.getLong("id");Map<String,Object> out=new LinkedHashMap<>();
    out.put("id",id);out.put("key",r.getString("canonical_key"));out.put("subject",r.getString("subject_code"));out.put("emoji",r.getString("emoji"));
    Map<String,String> translations=new LinkedHashMap<>();
    jdbc.query("SELECT locale,body FROM content_fact_translation WHERE fact_id=?",s->{translations.put(s.getString(1),s.getString(2));},id);
    out.put("translations",translations);
    out.put("grades",jdbc.query("SELECT DISTINCT grade_level FROM content_fact_audience WHERE fact_id=? AND audience='STUDENT' ORDER BY grade_level",(s,n)->s.getInt(1),id));
    out.put("audiences",jdbc.query("SELECT DISTINCT audience FROM content_fact_audience WHERE fact_id=? ORDER BY audience",(s,n)->s.getString(1),id));
    return out;
  }
  private static final String QUESTION_FILTER=" FROM quiz_question q JOIN content_fact f ON f.id=q.fact_id "
       +FILTER.replace(" FROM content_fact f WHERE f.status"," WHERE q.status='PUBLISHED' AND f.status");
  public long countQuestions(Filter f){return jdbc.queryForObject("SELECT count(*)"+QUESTION_FILTER,Long.class,args(f));}
  public List<Map<String,Object>> questions(Filter f){
    Object[] params=Arrays.copyOf(args(f),7);params[5]=f.limit;params[6]=f.offset;
    return jdbc.query("SELECT q.id,q.fact_id"+QUESTION_FILTER+" ORDER BY q.id LIMIT ? OFFSET ?",(r,n)->question(r.getLong(1),r.getLong(2)),params);
  }
  private Map<String,Object> question(long id,long factId){
    Map<String,Object> out=new LinkedHashMap<>();out.put("id",id);out.put("factId",factId);
    Map<String,Map<String,String>> text=new LinkedHashMap<>();
    jdbc.query("SELECT locale,prompt FROM quiz_question_translation WHERE question_id=?",
      r->{text.put(r.getString(1),Map.of("prompt",r.getString(2)));},id);
    out.put("translations",text);
    out.put("options",jdbc.query("SELECT id,position FROM quiz_option WHERE question_id=? ORDER BY position",(r,n)->{
      long optionId=r.getLong(1);Map<String,Object> option=new LinkedHashMap<>();option.put("id",optionId);option.put("position",r.getInt(2));
      Map<String,String> labels=new LinkedHashMap<>();
      jdbc.query("SELECT locale,body FROM quiz_option_translation WHERE option_id=?",x->{labels.put(x.getString(1),x.getString(2));},optionId);
      option.put("translations",labels);return option;
    },id));
    return out;
  }
}
