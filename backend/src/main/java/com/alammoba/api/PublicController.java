package com.alammoba.api;
import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
@RestController
@RequestMapping("/api/v1")
public class PublicController {
 @GetMapping("/status") public Map<String,Object> status(){ return Map.of("application","Alam Mo Ba?","status","ok","timestamp",Instant.now().toString(),"milestone","M1"); }
}
