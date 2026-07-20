# API and Response Contracts

## Base URL

All main backend endpoints are mounted under `/api`.

Local frontend usually calls the backend through `NEXT_PUBLIC_BACKEND_URL` and appends paths like `/auth/login` or `/appointments`.

## Response envelope

Use the existing response style everywhere.

Success:

```json
{ "success": true, "data": {} }
```

Error:

```json
{ "success": false, "error": "Message", "code": "ERROR_CODE" }
```

Frontend adapters often unwrap `body.data`. Breaking the envelope will break frontend code.

## Validation

Use Zod schemas in `*.schema.ts` and middleware from `src/shared/middleware/validate.middleware.ts`.

Patterns:

```ts
validate.validateBody(schema)
validate.validateQuery(schema)
validate.validateParams(schema)
```

Important warning: `validateQuery` currently parses but does not assign parsed values back to `req.query`. If you rely on coerced query values, verify the controller/service receives the expected type.

## OpenAPI

Zod schemas commonly use `.openapi()` metadata.

The app imports `src/shared/zod-setup` first so `.openapi()` is available. Do not remove or reorder that first import in `app.ts`.

Commands:

```bash
npm run generate:openapi
npm run validate:openapi
```

## Auth contract

Access tokens are expected in:

```txt
Authorization: Bearer <accessToken>
```

`requireAuth` also supports an `accessToken` cookie, but frontend code usually stores access token in memory and uses Bearer headers.

Refresh/logout are cookie-bound and CSRF-protected on the frontend.

## Frontend expectations

The frontend currently expects:

- `/auth/me` returns current user under `data`.
- `/auth/refresh` returns `data.accessToken`.
- `/appointments?businessId=<id>&date=YYYY-MM-DD` returns either `{ items, total, page, perPage }` or an array.
- `/staff?businessId=<id>` returns either `{ items }` or an array.
- `/services?businessId=<id>` returns either `{ items }` or an array.
- `PATCH /appointments/:appointmentId` returns a full appointment with `customer`, `appointmentServices`, `customItems`, and `invoice` included.
- `POST /invoices/collect-payment` should return enough information for frontend to map back to appointment state or the frontend should reload the calendar immediately.

## Route param naming

Appointment routes use `:appointmentId`.

Do not mix `:id` and `:appointmentId` in appointment middleware. `requireAppointmentOwnerOrAdmin` reads `req.params.appointmentId`.

## Error codes to preserve

Use stable codes for frontend-friendly behavior:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `BAD_REQUEST`
- `NOT_FOUND`
- `INVALID_STATE`
- `LOCKED`
- `SLOT_TAKEN`
- `ALREADY_CANCELLED`

`SLOT_TAKEN` should usually be HTTP 409.
