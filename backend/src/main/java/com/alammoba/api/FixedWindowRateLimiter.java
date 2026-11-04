package com.alammoba.api;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Bounded, process-local fixed-window limiter. */
@Component
public final class FixedWindowRateLimiter {
    public record Decision(boolean allowed, long retryAfterSeconds) {}
    private record Counter(long window, int requests) {}

    private final Map<String,Counter> counters=new HashMap<>();
    private final long windowMillis;
    private final int maxTrackedKeys;
    private long checks;

    public FixedWindowRateLimiter(
            @Value("${app.rate-limit.guest.window-seconds:60}") long windowSeconds,
            @Value("${app.rate-limit.guest.max-tracked-keys:10000}") int maxTrackedKeys) {
        if(windowSeconds<1 || maxTrackedKeys<1)throw new IllegalArgumentException("Rate limiter settings must be positive");
        this.windowMillis=windowSeconds*1000;
        this.maxTrackedKeys=maxTrackedKeys;
    }

    public synchronized Decision check(String key,int limit,long nowMillis) {
        if(limit<1)throw new IllegalArgumentException("Rate limit must be positive");
        long window=Math.floorDiv(nowMillis,windowMillis);
        if((++checks&63)==0)removeExpired(window);
        Counter current=counters.get(key);
        if(current==null || current.window()!=window) {
            if(current==null && counters.size()>=maxTrackedKeys)removeExpired(window);
            if(current==null && counters.size()>=maxTrackedKeys)
                return new Decision(false,secondsUntilWindowEnds(window,nowMillis));
            current=new Counter(window,0);
        }
        if(current.requests()>=limit)return new Decision(false,secondsUntilWindowEnds(window,nowMillis));
        counters.put(key,new Counter(window,current.requests()+1));
        return new Decision(true,0);
    }

    private void removeExpired(long currentWindow) {
        Iterator<Map.Entry<String,Counter>> iterator=counters.entrySet().iterator();
        while(iterator.hasNext())if(iterator.next().getValue().window()<currentWindow)iterator.remove();
    }

    private long secondsUntilWindowEnds(long window,long nowMillis) {
        long remaining=(window+1)*windowMillis-nowMillis;
        return Math.max(1,(remaining+999)/1000);
    }
}
