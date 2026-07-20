# Backend Architecture

## Repo identity

Repo: `Ahmed2902/Website-Maker`

Package name: `hgezli-backend`

Main backend stack:

- TypeScript
- Express
- Prisma Client
- PostgreSQL
- Zod
- OpenAPI generation
- Redis/BullMQ style jobs
- Luxon for timezone logic

## Entry and app composition

The Express app is created in `app.ts`.

Important app-level behavior:

- `src/shared/zod-setup` must be imported first so Zod `.openapi()` exists before schema modules load.
- Billing webhook is mounted before JSON body parsing using `raw({ type: "application/json" })` at `/api/billing/webhook`.
- App uses Helmet, CORS with credentials, global rate limit, JSON/urlencoded parsers, and cookie parser.
- Public root `/` returns API status.
- `/openapi.json` serves generated OpenAPI JSON.
- `/docs` serves Swagger UI.
- `/metrics` exposes Prometheus metrics.
- All main routes are mounted under `/api`.

## Route registry

Central route registry: `src/routes/index.ts`

Registered API modules:

- `/auth`
- `/businesses`
- `/website-content`
- `/staff`
- `/services`
- `/customers`
- `/bookings`
- `/appointments`
- `/faqs`
- `/photos`
- `/billing`
- `/invoices`
- `/analytics`
- `/onboarding`

Health endpoint:

- `GET /api/health`

## Module convention

Most backend modules follow this shape:

```txt
src/modules/<module>/
  <module>.routes.ts
  <module>.controller.ts
  <module>.service.ts
  <module>.schema.ts
```

Keep this convention for new modules.

## Shared utilities and middleware

Important shared paths:

- `src/shared/db/prisma` — Prisma client
- `src/shared/middleware/auth.middleware.ts` — auth and RBAC guards
- `src/shared/middleware/validate.middleware.ts` — Zod validation middleware
- `src/shared/middleware/errorHandler.middleware.ts` — error response handling
- `src/shared/utils/response.util.ts` — `{ success, data }` / `{ success, error, code }` envelope helpers
- `src/shared/utils/timezone.ts` — business-local day/week/month range helpers
- `src/shared/config/verticals.config.ts` — clinic/salon feature flags

## Database model highlights

Core models:

- `Business`
- `BusinessUser`
- `Staff`
- `Service`
- `ServiceStaff`
- `Availability`
- `AvailabilityOverride`
- `StaffBreak`
- `Customer`
- `Appointment`
- `AppointmentService`
- `AppointmentCustomItem`
- `Invoice`
- `InvoiceLineItem`
- `LoyaltyAccount`
- `ClinicVisitRecord`
- `Photo`
- `AppointmentPhoto`
- `InsuranceClaim`

Important relationships:

- `Business` owns almost everything through `businessId`.
- `ServiceStaff` maps which staff can perform which service and stores commission configuration.
- `Appointment` is the parent reservation.
- `AppointmentService` stores each service segment with its own staff, time, price snapshot, and order.
- `Invoice` is unique per appointment through `appointmentId`.
- `ClinicVisitRecord` is one-to-one with appointment and should only be used for clinic vertical logic.

## Timezone model

Businesses have a `timezone`, defaulting to `Africa/Cairo` in Prisma.

Use `src/shared/utils/timezone.ts` for business-local date boundaries. Do not do naive `new Date(date)` for date-only filters in business flows.

## Vertical modules

`VERTICAL_CONFIG` currently defines:

- `salon`: scheduling true, clinicalRecords false, appointmentPhotos true
- `clinic`: scheduling true, clinicalRecords true, appointmentPhotos true

When adding vertical-specific behavior, check `isModuleEnabled(vertical, moduleName)`.
