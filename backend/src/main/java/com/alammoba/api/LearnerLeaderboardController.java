package com.alammoba.api;

import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Privacy-preserving weekly board. Only server-graded, authenticated answers count. */
@RestController
@RequestMapping("/api/v1/leaderboard")
public class LearnerLeaderboardController {
    private final JdbcTemplate jdbc;
    private final AccountIdentityController identity;

    public LearnerLeaderboardController(JdbcTemplate jdbc, AccountIdentityController identity) {
        this.jdbc = jdbc;
        this.identity = identity;
    }

    public record Entry(int rank, String displayName, int points, boolean you) {}
    public record Board(String period, List<Entry> entries, Integer yourRank, int yourPoints) {}

    @GetMapping("/weekly")
    public ResponseEntity<Board> weekly(
            @RequestHeader(value=HttpHeaders.AUTHORIZATION, required=false) String authorization) {
        UUID account = identity.accountFromHeader(authorization);
        List<Entry> entries = jdbc.query("""
            WITH scores AS (
              SELECT account_id, COUNT(*)::int AS points
              FROM learning_leaderboard_correct_answer
              WHERE activity_date >= date_trunc('week', CURRENT_DATE)::date
              GROUP BY account_id
            ), ranked AS (
              SELECT account_id, points,
                     RANK() OVER (ORDER BY points DESC) AS place
              FROM scores
            )
            SELECT ranked.place, profile.display_name, ranked.points, ranked.account_id = ?
            FROM ranked
            JOIN learning_account_profile profile ON profile.account_id=ranked.account_id
            ORDER BY ranked.points DESC, lower(profile.display_name) ASC
            LIMIT 50
            """, (rs, row) -> new Entry(rs.getInt(1), rs.getString(2), rs.getInt(3), rs.getBoolean(4)), account);
        record Standing(Integer rank, Integer points) {}
        Standing standing = jdbc.query("""
            WITH scores AS (
              SELECT account_id, COUNT(*)::int AS points
              FROM learning_leaderboard_correct_answer
              WHERE activity_date >= date_trunc('week', CURRENT_DATE)::date
              GROUP BY account_id
            ), ranked AS (
              SELECT account_id, points, RANK() OVER (ORDER BY points DESC) AS place
              FROM scores
            )
            SELECT place, points FROM ranked WHERE account_id=?
            """, (rs, row) -> new Standing(rs.getInt(1), rs.getInt(2)), account)
            .stream().findFirst().orElse(new Standing(null, 0));
        Board board = new Board("WEEKLY", entries, standing.rank(), standing.points());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(board);
    }
}
