package com.alammoba.api;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Expired anonymous backups, consumed login challenges and shared rate-limit
 * buckets are automatically removed. Referenced guest progress is cascaded.
 */
@Component
public class SecurityRetentionCleanup {
    private final JdbcTemplate jdbc;
    public SecurityRetentionCleanup(JdbcTemplate jdbc){this.jdbc=jdbc;}

    @Scheduled(cron="0 17 3 * * *",zone="UTC")
    public void dailyCleanup(){
        jdbc.update("DELETE FROM api_rate_limit_bucket WHERE window_epoch < (EXTRACT(EPOCH FROM NOW())::BIGINT / 60) - 60");
        jdbc.update("DELETE FROM learning_login_challenge WHERE expires_at < NOW() OR consumed_at IS NOT NULL");
        jdbc.update("DELETE FROM learning_account_session WHERE expires_at < NOW() OR revoked_at IS NOT NULL");
        jdbc.update("DELETE FROM learning_guest_credential WHERE expires_at < NOW() OR revoked_at IS NOT NULL");
    }
}
