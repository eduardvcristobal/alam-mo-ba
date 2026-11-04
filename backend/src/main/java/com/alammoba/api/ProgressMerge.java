package com.alammoba.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Non-destructive merge of verified account state and a guest state.
 * Existing account settings take precedence; fact IDs are unioned,
 * and attempts deduplicated, preserving up to the 100 most recent.
 */
final class ProgressMerge {
    private static final ObjectMapper JSON=new ObjectMapper();
    private ProgressMerge() {}

    static JsonNode merge(JsonNode account,JsonNode guest) {
        ObjectNode result = account != null && account.isObject()
            ? ((ObjectNode) account).deepCopy() : JSON.createObjectNode();
        if (guest != null && guest.isObject()) {
            for (String field : new String[]{"mode","lang","grade","subject","count"}) {
                if ((!result.has(field) || result.get(field).isNull()) && guest.has(field)) {
                    result.set(field,guest.get(field).deepCopy());
                }
            }
            String current = result.path("last").asText("");
            String incoming = guest.path("last").asText("");
            if (incoming.compareTo(current) > 0) {
                result.put("last",incoming);
                result.put("streak",Math.max(0,guest.path("streak").asInt(0)));
            }
        }
        for (String field : new String[]{"saved","learned","attempts"}) {
            Map<String,JsonNode> unique=new LinkedHashMap<>();
            if (field.equals("attempts")) {
                collect(unique,guest==null?null:guest.get(field));
                collect(unique,result.get(field));
            } else {
                collect(unique,result.get(field));
                collect(unique,guest==null?null:guest.get(field));
            }
            int max=field.equals("attempts")?100:10000;
            var values=new java.util.ArrayList<>(unique.values());
            ArrayNode merged=JSON.createArrayNode();
            for(int i=Math.max(0,values.size()-max);i<values.size();i++)merged.add(values.get(i));
            result.set(field,merged);
        }
        if(!result.has("last"))result.put("last","");
        if(!result.has("streak"))result.put("streak",0);
        GuestProgressController.validateState(result);
        return result;
    }

    private static void collect(Map<String,JsonNode> seen,JsonNode node) {
        if(node!=null && node.isArray())for(JsonNode item:node)seen.putIfAbsent(item.toString(),item);
    }
}
