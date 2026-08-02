# Hgezli — Architecture & Stack

This document describes the architecture, components, deployment notes, and operational considerations for the Hgezli project. It is written for engineers and automation agents preparing integrations, deployments, or performance tuning.

## System components

- API Server
  - Language: TypeScript (Node.js)
  - Framework: Express (routes under `src/routes`)
  - Key responsibilities: REST endpoints, authentication (JWT), validation (Zod), file uploads (Multer), rate-limiting, CSRF protection.

- Background Worker
  - Library: BullMQ (Redis-backed queues)
  - Responsibilities: email sending, reminders, scheduled jobs, webhook handling retries, long-running tasks.

- Database
  - PostgreSQL managed via Prisma ORM (`prisma/schema.prisma`).
  - Migrations stored under `prisma/migrations`.

- Cache / Queuing
  - Redis for BullMQ queues and ephemeral locks.

- External Integrations
  - Email provider(s): Brevo or SMTP via nodemailer (configurable by env vars)
  - Subscription billing: lifecycle state stored in PostgreSQL; payment provider integration is pending.
  - Object storage: local `uploads/` by default; production may use S3-compatible storage or cloudinary.

## Deployment artifacts

- `Dockerfile` and `docker-compose.yml` provided for containerized runs.
- `nginx/default.conf` used as a reverse proxy (TLS certs under `nginx/certs`).

## Configuration & environment variables (critical)

- `DATABASE_URL` — Postgres connection string.
- `REDIS_URL` — Redis connection.
- `JWT_SECRET`, `REFRESH_TOKEN_SECRET` — secrets for signing tokens.
- `APP_URL`, `FRONTEND_URL` — used in email link generation and CORS.
- `EMAIL_PROVIDER_*` — provider credentials.

Variable defaults and reading code is under [src/shared/config/config.ts](src/shared/config/config.ts#L1).

## Security model

- Authentication: stateless `accessToken` JWTs and HttpOnly `refreshToken` cookies.
- Authorization: RBAC via `requireRole` middleware and business-scoped checks (`requireBusinessAccess`).
- CSRF: cookie flows (refresh/logout) are CSRF-protected; other endpoints protected via JWT.
- Rate limiting: `express-rate-limit` applied globally and per-route for sensitive flows.

## Data flow (simplified)

1. Client requests `/auth/login` → server validates credentials → responds with `accessToken` + `refreshToken` cookie.
2. Client requests protected resource → `requireAuth` validates `Authorization: Bearer <token>`.
3. Booking creation enqueues reminder jobs → worker picks up job and sends emails via the configured email provider.
4. Subscription flow: onboarding creates the lifetime trial; billing reads and updates the typed subscription lifecycle.

## Scaling & operational notes

- API server: stateless; scale horizontally behind load balancer. Use consistent `JWT_SECRET` and DB + Redis connectivity across replicas.
- Worker: can scale horizontally; ensure job concurrency and named queues are tuned to avoid duplicate deliveries. Use job locks (BullMQ) for critical sections.
- Database: use read replicas for heavy read loads (public availability queries), but ensure booking & appointment writes are serialised via DB constraints and distributed locks when necessary.

## Observability

- Health endpoints: `/health`
- Metrics: `/metrics` (Prometheus)
- Logs: Node process logs (stdout) and worker logs. Consider structured logging (JSON) and central aggregation.

## Testing considerations

- Unit tests: Jest used for code-level tests; test files in `/tests`.
- Integration tests: run server + test database + Redis; use `NODE_ENV=test` and separate `DATABASE_URL` / `REDIS_URL`.
- End-to-end: spin up containers via `docker-compose` and run integration suite.

## Deployment checklist

- Provide environment variables in secrets manager (DB, Redis, email, JWT secrets).
- Run Prisma migrations: `npx prisma migrate deploy`.
- Start API and worker processes (separately) — `pm2`, `systemd`, Kubernetes Deployments, or Docker Compose.
- Configure load balancer and TLS (Nginx in front or cloud LB).
- Configure background jobs monitoring (BullBoard or custom UI).

## Architectural trade-offs & notes

- Using cookies for refresh tokens improves security for browser clients but adds CSRF complexity for automated agents — tests should favor access token flows.
- Background job eventual consistency: reminders and emails are asynchronous which simplifies UX but requires test harnesses to wait/flush queues.
- Prisma + Postgres provides type-safe DB access but requires explicit transaction handling for multi-step operations (e.g., booking + payment). Use DB transactions for critical flows.

---

For more detailed diagrams or a deployment Helm chart, tell me which target environment you want (Kubernetes, Docker Compose, or serverless) and I will generate it.
