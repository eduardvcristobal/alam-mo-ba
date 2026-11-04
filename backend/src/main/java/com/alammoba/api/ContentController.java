package com.alammoba.api;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/content")
@CrossOrigin(origins="${app.cors.origin:http://localhost:5173}")
public class ContentController {
  private final ContentRepository repository;
  public ContentController(ContentRepository repository){this.repository=repository;}

  @GetMapping("/facts")
  public Map<String,Object> facts(@RequestParam(defaultValue="explore") String mode,
      @RequestParam(required=false) Integer grade,@RequestParam(required=false) String subject,
      @RequestParam(defaultValue="20") int limit,@RequestParam(defaultValue="0") int offset){
    var filter=ContentRepository.Filter.of(mode,grade,subject,limit,offset);
    return Map.of("items",repository.facts(filter),"total",repository.countFacts(filter),"limit",filter.limit(),"offset",filter.offset());
  }
  @GetMapping("/facts/{id}")
  public ResponseEntity<Map<String,Object>> fact(@PathVariable long id){
    return repository.fact(id).map(ResponseEntity::ok).orElseGet(()->ResponseEntity.notFound().build());
  }
  @GetMapping("/questions")
  public Map<String,Object> questions(@RequestParam(defaultValue="explore") String mode,
      @RequestParam(required=false) Integer grade,@RequestParam(required=false) String subject,
      @RequestParam(defaultValue="20") int limit,@RequestParam(defaultValue="0") int offset){
    var filter=ContentRepository.Filter.of(mode,grade,subject,limit,offset);
    return Map.of("items",repository.questions(filter),"total",repository.countQuestions(filter),"limit",filter.limit(),"offset",filter.offset());
  }
}
