package com.alammoba.api;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminDraftValidationTest {
    private static AdminContentController.FactDraft fact(String url,boolean student,Integer grade){
        return new AdminContentController.FactDraft("science-water-freeze","Science","🧊",
            "Water freezes around 0°C.","Nagyeyelo ang tubig sa paligid ng 0°C.",
            student,grade,true,url.isBlank()?"":"Fixture source",url);
    }
    private static AdminQuizController.QuestionDraft quiz(List<AdminQuizController.OptionDraft> options){
        return new AdminQuizController.QuestionDraft(1,"Water freezes at?","Kailan nagyeyelo ang tubig?",
            "Around 0°C.","Sa paligid ng 0°C.",options);
    }
    @Test void acceptsBilingualFactsWithHttpsSourceAndAudience(){
        assertThatNoException().isThrownBy(()->AdminContentController.validate(fact("https://example.org",true,7)));
    }
    @Test void rejectsInvalidFactKeysSourcesAndGrade(){
        assertThatThrownBy(()->AdminContentController.validate(fact("http://example.org",true,7)))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->AdminContentController.validate(fact("https://example.org",true,17)))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->AdminContentController.validate(new AdminContentController.FactDraft(
            "UPPER","Science","💡","English","Filipino",false,null,true,"","")))
            .isInstanceOf(ResponseStatusException.class);
    }
    @Test void acceptsExactlyOneCorrectAnswer(){
        assertThatNoException().isThrownBy(()->AdminQuizController.validate(quiz(List.of(
            new AdminQuizController.OptionDraft("0°C","0°C",true),
            new AdminQuizController.OptionDraft("100°C","100°C",false)))));
    }
    @Test void rejectsMalformedQuizAndMultipleCorrectOptions(){
        assertThatThrownBy(()->AdminQuizController.validate(quiz(List.of(
            new AdminQuizController.OptionDraft("0°C","0°C",true),
            new AdminQuizController.OptionDraft("100°C","100°C",true)))))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->AdminQuizController.validate(quiz(List.of(
            new AdminQuizController.OptionDraft("0°C","0°C",true)))))
            .isInstanceOf(ResponseStatusException.class);
    }
}
