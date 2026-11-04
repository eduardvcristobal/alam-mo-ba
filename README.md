# Alam Mo Ba? — M1 Development Foundation

Based on the **approved Prototype V2.1** (see `reference/`), this repository begins the production migration with a React/TypeScript/Vite frontend and a Java 17/Spring Boot/PostgreSQL/Flyway backend scaffold.

## Run the interactive frontend (no database required)

Prerequisites: Node.js 20+ and npm.

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Guest progress stays in the browser. Select **Student** or **Explore** on first launch. Use the Quiz tab to select 1–100 questions, then repeat the exact quiz or request a new set after completion. The sample question bank currently contains **9 questions** so requests above 9 are capped. "New set" prioritizes unseen questions and reuses older questions when necessary.

```bash
npm run build
npm test
```

## Run the backend (optional for M1 frontend)

Prerequisites: Java 17+, Maven 3.9+, Docker Compose for PostgreSQL.

```bash
cp .env.example .env
# edit .env as needed, then load it or export DB_URL / DB_USER / DB_PASSWORD
# To start with the provided defaults, loading .env is optional.
docker compose up -d postgres
cd backend
mvn spring-boot:run
```

API: http://localhost:8080/api/v1/status and health http://localhost:8080/actuator/health. Spring Boot applies the initial Flyway migration when the API starts. The frontend currently reads the bundled sample content; **the backend is not yet connected to the frontend**.

## Current M1 scope

- Guest-first onboarding and switchable Student/Explore modes.
- Fact of the day, grade/subject/topic browsing, search, saves, learning history.
- Bilingual English/Filipino strings; light/dark theme.
- Configurable quiz size, randomized answer order, 50:50 lifeline, final-answer and explanation flow.
- Repeat same questions or generate another question set prioritizing unseen questions.
- Browser-local guest state; basic Vitest quiz logic tests.
- Spring Boot status endpoint and initial normalized content/quiz/guest session schema.

## Not yet completed / important boundaries

- Content is illustrative and not independently source-verified or DepEd-certified.
- Server-backed facts, content review workflow, sign-in, account sync, real notifications and API-based guest migrations are future milestones.
- API authentication, permissions, operational security hardening and production migrations are not certified.
- No live deployment or external CI has been completed as part of this handoff.
- The initial schema is a foundation, not a claim that all CRUD workflows exist.

## Next development milestone

M1.1: connect frontend to read-only published-content APIs, implement server-side filtering/pagination, and seed only verified sample content. M1.2: secure authenticated accounts and import guest progress with explicit consent. M1.3: CMS review/publishing workflow, curriculum versioning and source tracking.
