# Website-Maker

Quick notes for running the backend locally and deploying.

Local development

- Install dependencies:

```bash
npm install
```

- Generate Prisma client (after editing `prisma/schema.prisma`):

```bash
npx prisma generate --schema=prisma/schema.prisma
```

- Run database migrations (development):

```bash
npx prisma migrate dev --name init
```

- Build TypeScript and run web server:

```bash
npm run build
npm start
```

- Run background worker (separate process):

```bash
npm run start:worker
```

- Seed plans (after build):

```bash
npm run seed:plans
```

Tests

- Run tests with:

```bash
npm test
```

Environment variables

- `DATABASE_URL` — Postgres connection string (Supabase)
- `REDIS_URL` — Redis connection string (Upstash / Redis)
- `EMAIL_SMTP_URL` or `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS` — SMTP config for nodemailer
- `EMAIL_FROM` — canonical sender address (optional)
- `FRONTEND_URL` — frontend base URL used for links
- `APP_URL` — canonical app URL used for links
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — strong JWT secrets for access/refresh tokens
- `NODE_ENV` — `development` or `production`
- `PORT` — server port
- `SENTRY_DSN` — optional Sentry DSN for errors
- `PAYMOB_API_KEY`, `PAYMOB_HMAC` — optional Paymob keys for billing
- `SENTRY_DSN` — optional Sentry DSN for errors
- `PAYMOB_API_KEY`, `PAYMOB_HMAC` — optional Paymob keys for billing
- `ENABLE_METRICS` — (optional) enable Prometheus metrics endpoint at `/metrics`

Notes

- Background jobs (reminders) run from the worker process. The web server no longer registers jobs automatically.
- Reminders are enqueued into a BullMQ queue and processed by the worker. `ReminderLog` is used for durable idempotency.
- For production, run migrations with `npx prisma migrate deploy` and run the worker as a separate service/process.
- For production, run migrations with `npx prisma migrate deploy` and run the worker as a separate service/process.
- CI: A GitHub Actions workflow is provided at `.github/workflows/ci.yml` which runs `npm ci`, `prisma generate`, `npm run build` and `npm test` on push/PR to `main`.

Deployment notes (Railway / Supabase / Upstash / Cloudflare)

- Database: Use Supabase Postgres. Set `DATABASE_URL` to the Supabase connection string. Run migrations in production with:

```bash
npx prisma migrate deploy --schema=prisma/schema.prisma
```

- Redis: Use Upstash for managed Redis. Set `REDIS_URL` to the Upstash connection string. For BullMQ use the Upstash Redis REST or the standard Redis URL depending on plan; prefer the Redis URL for worker processes.

- Storage & files: Cloudinary or similar for images; configure environment variables per provider.

- Mail: Configure SMTP via `EMAIL_SMTP_URL` or `EMAIL_SMTP_HOST` / `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASS`.

- Environment variables to set on Railway / Cloudflare Workers Pages (server):

  - `DATABASE_URL`, `REDIS_URL`, `EMAIL_SMTP_URL` (or host/port/user/pass), `EMAIL_FROM`, `FRONTEND_URL`, `APP_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SENTRY_DSN` (optional), `PAYMOB_API_KEY` (optional).

- Services to run:

  - Web server: `node dist/server.js` (or the `start` script)
  - Worker: run `node dist/src/worker.js` as a separate service for background jobs and queue processing

- Cloudflare: Use Cloudflare for DNS and optionally as a CDN in front of the frontend. Terminate TLS at Cloudflare and point DNS to Railway / server.

Example Railway setup:

1. Add the repo as a Railway project.
2. Set environment variables in Railway settings (see list above).
3. Add two services: `web` (command: `npm run build && npm start`) and `worker` (command: `npm run build && npm run start:worker`).
4. Add persistent volumes if you need to store prisma query engine artifacts locally (optional).

Remember: run `npm run prisma:generate` before build in CI or Docker so Prisma Client is available.
