package com.alammoba.api;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class PlatformAdminValidationTest {
    @Test void factRequiresBilingualTextAndVerifiedSourceInput(){
        var good=new PlatformAdminContentController.FactDraft(
            "ice-floats","Science","🧊","Ice floats","Lumulutang ang yelo",
            true,List.of(7),"Educational source","https://example.org/science");
        assertThatNoException().isThrownBy(()->PlatformAdminContentController.checkFact(good));
        assertThatThrownBy(()->PlatformAdminContentController.checkFact(
            new PlatformAdminContentController.FactDraft("x","Science","", "English","",
                true,List.of(),"Title","https://example.org")))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->PlatformAdminContentController.checkFact(
            new PlatformAdminContentController.FactDraft("x","Science","", "English","Filipino",
                false,List.of(),"Title","javascript:alert(1)")))
                .isInstanceOf(ResponseStatusException.class);
    }
    @Test void quizMustHaveOneCorrectChoiceAndTranslations(){
        var a=new PlatformAdminContentController.ChoiceDraft("A","Una",true);
        var b=new PlatformAdminContentController.ChoiceDraft("B","Ikalawa",false);
        var valid=new PlatformAdminContentController.QuizDraft(
            1,"Which?","Alin?","Because","Dahil",List.of(a,b));
        assertThatNoException().isThrownBy(()->PlatformAdminContentController.checkQuiz(valid));
        assertThatThrownBy(()->PlatformAdminContentController.checkQuiz(
            new PlatformAdminContentController.QuizDraft(
                1,"Which?","Alin?","Because","Dahil",List.of(a,a))))
            .isInstanceOf(ResponseStatusException.class);
    }
    @Test void learnerAndSupportCannotEditOrPublish(){
        var learner=new PlatformAdminGuard.Operator(UUID.randomUUID(),Set.of());
        var support=new PlatformAdminGuard.Operator(UUID.randomUUID(),Set.of("SUPPORT"));
        assertThatThrownBy(()->PlatformAdminGuard.requireEdit(learner))
            .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(()->PlatformAdminGuard.requirePublish(support))
            .isInstanceOf(ResponseStatusException.class);
    }
    @Test void authorCannotApproveOwnDraftAndTransitionsMustMatch(){
        UUID author=UUID.randomUUID();
        var target=new PlatformEditorialController.ReviewTarget(
            "facts",1,"IN_REVIEW",author,null);
        assertThatThrownBy(()->PlatformEditorialController.ensureIndependentReviewer(target,author))
            .isInstanceOf(ResponseStatusException.class);
        assertThatNoException().isThrownBy(()->PlatformEditorialController.ensureIndependentReviewer(target,UUID.randomUUID()));
        assertThatThrownBy(()->PlatformEditorialController.requireStatus(target,"APPROVED"))
            .isInstanceOf(ResponseStatusException.class);
    }
}
