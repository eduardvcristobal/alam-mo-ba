# Alam Mo Ba? — Did You Know + Quiz

A guest-first, bilingual English/Filipino mobile-first learning platform for both **Student Mode** and **Explore Mode**.

## Run locally

Requirements: Node.js 22+, Java 17+, Maven 3.9+, Docker with Compose.

### Frontend preview only (no database required)
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. You can browse 36 sample facts, nine quizzes, and guest-local progress. The API is optional for this preview; sample facts are labeled **unverified**.

### Full backend and PostgreSQL
Start PostgreSQL from the repository root:
```bash
docker compose up -d postgres
```
Start Spring Boot in another terminal:
```bash
cd backend
export DB_URL=jdbc:postgresql://localhost:5432/alammoba
export DB_USER=alammoba
export DB_PASSWORD=alammoba_dev
mvn spring-boot:run
```
Start the frontend in a third terminal using the steps above. The Vite proxy sends `/api` requests to `http://localhost:8080`. Spring Boot applies Flyway migrations automatically at startup. The application intentionally **does not** publish unreviewed sample facts into PostgreSQL.

### Quality gates
```bash
cd frontend
npm test
npm run build
npx playwright install chromium
npm run test:e2e

cd ../backend
mvn clean verify
```

GitHub Actions also runs a PostgreSQL 16/Flyway smoke test with isolated synthetic fixtures that verify published-content filtering and server-side quiz grading. See [M1.1 acceptance evidence](docs/M1.1-FINAL-ACCEPTANCE.md).

## Product behavior

- First launch: choose Student Mode or Explore Mode, without registering.
- Student Mode: grade and subject filters; Explore Mode: discovery and trivia browsing.
- Bilingual EN/FIL facts, sample quizzes, local bookmarks, and streaks.
- Quiz settings: 1–100 questions, capped to the available pool. After finishing, choose **Repeat the same questions** or **Try another question set**.
- When the content API has verified published facts/questions, they take precedence. When no published content exists, local preview data is clearly marked **unverified**.
- Guest progress stays in this browser unless the learner enables optional guest backup in Profile. Once enabled, progress changes are saved automatically to a device-bound anonymous backup; account sign-in and cross-device recovery are not available.

## Branch and review policy

Development uses dedicated feature branches with verified commits and draft PRs against `main`. **Never merge automatically.** Editorial review, additional accessibility audits, and live release acceptance remain separate approval gates.
