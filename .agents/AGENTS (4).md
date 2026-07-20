# AGENTS.md — Hgezli Backend

This is the main instruction file for agents working in the backend repo `Website-Maker`.

## Read first

Before editing backend code, read:

1. `docs/agent/BACKEND_ARCHITECTURE.md`
2. `docs/agent/API_AND_RESPONSE_CONTRACTS.md`
3. `docs/agent/SCHEDULING_AND_APPOINTMENTS.md`
4. `docs/agent/PAYMENTS_AND_INVOICES.md`
5. `docs/agent/SECURITY_AND_RBAC.md`
6. `docs/agent/CODING_RULES.md`
7. `docs/agent/TASK_TEMPLATE.md` if the user gives a complex task

Also read shared product context if copied into this repo:

- `docs/agent/PROJECT_CONTEXT.md`
- `docs/agent/PRODUCT_DECISIONS.md`

## Backend stack

- Node.js + TypeScript
- Express 5
- CommonJS package type
- Prisma + PostgreSQL
- Zod validation
- OpenAPI docs generated from route/schema metadata
- BullMQ / Redis and worker-style background jobs
- Luxon for timezone-sensitive business date logic

## Core rules

- Keep every business-owned query scoped by `businessId` unless the user is `SuperAdmin`.
- Do not trust `businessId` from the client unless middleware or service logic verifies it against `req.user.businessId`.
- Use existing response envelope helpers: success responses are `{ success: true, data }`; errors are `{ success: false, error, code }`.
- Validate `body`, `params`, and `query` with Zod schemas before controllers call services.
- Use `appointmentId` route params for appointment routes. Do not accidentally use `id` in middleware or schemas for appointment-specific routes.
- Keep appointments, appointment service segments, custom items, and invoices transactionally consistent.
- Do not edit paid/completed/cancelled appointments unless the flow is explicitly a revert/uncancel operation.
- If a change affects frontend contracts, update frontend API adapters/types too.

## Commands

Common backend commands:

```bash
npm run build
npm test
npm run prisma:generate
npm run prisma:migrate:deploy
npm run generate:openapi
npm run validate:openapi
```

Do not run destructive database commands unless the user explicitly asks.

## Expected task workflow

1. Inspect the relevant route, schema, controller, service, helper, and Prisma model.
2. Identify frontend contract impact.
3. Make the smallest safe change.
4. Run or explain the relevant validation command.
5. Summarize changed files and behavior.
