package com.alammoba.api;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ContentFilterTest {
 @Test void acceptsStudentGrade(){var f=ContentRepository.Filter.of("student",7,"Science",20,0);assertThat(f.grade()).isEqualTo(7);}
 @Test void rejectsUnknownMode(){assertThatThrownBy(()->ContentRepository.Filter.of("invalid",null,null,20,0)).isInstanceOf(ResponseStatusException.class);}
 @Test void rejectsExploreGrade(){assertThatThrownBy(()->ContentRepository.Filter.of("explore",7,null,20,0)).isInstanceOf(ResponseStatusException.class);}
 @Test void rejectsInvalidCount(){assertThatThrownBy(()->ContentRepository.Filter.of("student",null,null,101,0)).isInstanceOf(ResponseStatusException.class);}
 @Test void rejectsNegativeOffset(){assertThatThrownBy(()->ContentRepository.Filter.of("explore",null,null,20,-1)).isInstanceOf(ResponseStatusException.class);}
 @Test void rejectsInvalidSubject(){assertThatThrownBy(()->ContentRepository.Filter.of("explore",null,"Science' OR 1=1",20,0)).isInstanceOf(ResponseStatusException.class);}
}
