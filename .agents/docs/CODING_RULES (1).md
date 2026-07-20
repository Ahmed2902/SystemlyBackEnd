# Backend Coding Rules

## Style

- Keep TypeScript explicit but not over-engineered.
- Prefer service methods for business logic.
- Keep controllers thin.
- Keep validation in Zod schemas.
- Use Prisma transactions for multi-step writes.
- Preserve existing error shape with `statusCode` and `code` on thrown errors.

## Do not do

- Do not bypass Zod validation for public inputs.
- Do not trust frontend-provided `businessId` alone.
- Do not mutate appointment/invoice/customer counters outside transactions when related state changes together.
- Do not change response envelope shape without updating frontend adapters.
- Do not introduce large abstractions for one-off flows.
- Do not create direct `new Date(date)` business-day filtering for user-facing date filters.
- Do not remove OpenAPI metadata casually.

## Prefer

- Reuse helper functions in `appointments.helper.ts` for appointment state rules.
- Reuse `timezone.ts` for business-local date logic.
- Reuse `scheduleServiceSegments` for sequential multi-service appointment assignment.
- Include the same relation payload that frontend mappers need after mutations.
- Use stable error codes for frontend behavior.

## Date and money conventions

Dates:

- Store instants as `DateTime`/UTC in DB.
- Interpret date-only UI filters in business timezone.
- Use Luxon utilities in `timezone.ts`.

Money:

- API/UI often uses cents for operations/invoices.
- Prisma service prices are `Decimal priceEgp`.
- Convert carefully with `Math.round(Number(priceEgp) * 100)`.

## Adding endpoints

When adding an endpoint:

1. Add schema in `*.schema.ts`.
2. Add controller method.
3. Add service method.
4. Register route with auth/RBAC middleware.
5. Include OpenAPI metadata where useful.
6. Add or update tests if the behavior is risky.
7. Check frontend adapter/type impact.

## High-risk modules

Treat these as high-risk and inspect before touching:

- `src/modules/appointments/*`
- `src/modules/invoices/*`
- `src/modules/bookings/*`
- `src/modules/Scheduling/Scheduling.service.ts`
- `src/shared/middleware/auth.middleware.ts`
- `prisma/schema.prisma`
