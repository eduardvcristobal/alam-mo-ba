package com.alammoba.api;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
class PublicControllerTest {
 @Test void returnsStatus(){assertThat(new PublicController().status()).containsEntry("status","ok").containsEntry("milestone","M1");}
}
