# Alam Mo Ba? — Autonomous Development Roadmap

Status: planned; work is accepted only when its verification gate passes.
Baseline: approved Prototype V2.1, guest-first access, Student Mode + Explore Mode, English/Filipino, configurable quiz count, and repeat same/new question set.

## Git delivery contract
- Use latest `main` as base for independent milestones unless an unmerged dependency requires a clearly documented stacked branch.
- Create `feature/<milestone>-<scope>` for changes. Keep every PR **draft** until its acceptance gate is met. Never merge automatically.
- Make focused, descriptive commits per verified sub-milestone; push branches and open/update PRs.
- Run the available Maven, frontend, migration, and browser checks; record exact commands and failures in the PR. Do not label unrun checks as passed.
- Do not commit secrets, passwords, private keys, production data, build artifacts or `.env` files.
- Keep original HTML prototype as UI/UX baseline, but treat sample facts as unverified.
- Report any missing credentials, incompatible environment, or required human approvals as explicit blockers rather than fabricating completion.
- Never automatically publish unreviewed educational content or merge PRs.

## M1.1 — Content API integration (current priority)
1. Audit `feature/m1-1-content-api` against latest `main`; document missing React baseline, migrations and test gaps.
2. Import React/Vite frontend source and approved prototype assets; verify build and basic navigation.
3. Implement published-fact list/detail, topics, language and grade filtering, pagination, DTO validation and stable responses.
4. Connect Student/Explore screens to API; implement loading, empty, offline and error states without regressing guest mode.
5. Implement server-backed quiz set generation, configurable count and repeat/new set semantics. Return only client-safe question payloads; verify scores server-side when authenticated.
6. Add deterministic sample-data import in local/dev only, not public production content.
7. Certify Maven tests, database migrations on fresh PostgreSQL, Vitest and browser E2E; update draft PR. **No merge without acceptance.**

## M1.2 — Guest progress and accounts
- Guest local-first IndexedDB persistence; schema migration and recovery.
- Optional OIDC account registration; import guest data idempotently without loss or duplication.
- Cross-device sync, tenant/user access controls, and deletion/export flows.
- Age-appropriate privacy and consent decisions before release.

## M2 — Discovery and learning
- Daily fact allocation in local timezone; accurate learning and streak events.
- Student curriculum browsing by grade/subject and competency version.
- Explore browsing, full-text discovery, interests, bookmarks and bilingual presentation.
- Source attribution, verification status and content freshness.

## M3 — Quiz and mastery
- Configurable quiz size capped by eligible inventory; repeat exact IDs/order or request a fresh set.
- Avoid immediate repeats until the eligible pool is exhausted; explicit fallback when exhausted.
- Versioned, server-validated question attempts, review of incorrect answers, accessibility and localization.
- Explain grading rules, progress metrics and anti-abuse limits.

## M4 — Content administration
- Editorial draft/review/approve/publish/retire workflow with reviewer roles and audit log.
- Translations, references, topic mapping, curriculum/grade mapping and media.
- Only show teacher-reviewed/DepEd-aligned claims after genuine verification; periodic content re-review.

## M5 — Engagement and release readiness
- Achievements, optional notifications, analytics with privacy safeguards.
- Mobile/PWA offline read-only caching, accessibility and performance budgets.
- PostgreSQL backup/restore evidence, security regression, CI matrix, observability and launch checklist.

## Suggested CI acceptance
- Backend: `mvn -B test` with Java 17+, plus Flyway migration check against a fresh PostgreSQL database.
- Frontend: `npm ci`, `npm run build`, `npm test -- --run` (adapt to actual scripts), Playwright smoke/E2E.
- Security: dependency scans, secrets check, unauthenticated content restrictions and data isolation.
- Evidence: test counts and logs, migrations tested, screenshot/recording of primary UI flows, and documented known gaps.

## Release policy
M1.1 is **in progress**, not certified. Remaining milestones are **planned**, not implemented. A draft PR is a review artifact, not an assertion of production readiness.
