<!--
Auto-generated API documentation for frontend integration and automated agents.
Do not edit unless you need to update endpoint behavior. Use paths under /api.
-->

# Hgezli API — Frontend Integration Guide

Base URL (local dev): `http://localhost:3000/api`

This document is a complete, ready-to-use API specification and integration guide intended for frontend developers and integration/testing agents. It includes concrete request/response examples, authentication flows, environment configuration, and ready test commands.

---

## Quick variables for scripts

- BASE (replace for your environment): `http://localhost:3000/api`
- COOKIE JAR (curl): `cookies.txt`

---

## 1. Project Overview (short)

- API: REST (Express + TypeScript) mounted at `/api`
- Auth: JWT access tokens (in Authorization header) + refresh tokens (HttpOnly cookie `refreshToken`)
- DB: PostgreSQL via Prisma
- Queue: Redis + BullMQ (background worker)

---

## 2. Authentication & Token Flow (how frontend/agent should integrate)

Summary:

- Login/verify endpoints return an `accessToken` in the JSON response and set a cookie named `refreshToken` (HttpOnly).
- Frontend should store `accessToken` in memory (not localStorage) and send it in `Authorization: Bearer <accessToken>` for protected requests.
- To renew tokens, call `POST /auth/refresh`.

Security notes for automated agents:

- The server applies CSRF protection to cookie-bound actions (refresh/logout). For automated tests, prefer using the access token for requests that require authentication. If you MUST use cookie refresh flows, ensure you provide a valid CSRF token per your environment (server-side may expose it via a `GET /csrf` endpoint in some deployments). If CSRF blocks refresh in tests, use environment `NODE_ENV=test` or call refresh with the refresh token in request body (testing-only) if the server accepts it.

Axios example for integration (TypeScript):

```ts
import axios from "axios";

const API = axios.create({
  baseURL: process.env.API_BASE || "http://localhost:3000/api",
});

let accessToken: string | null = null;

API.interceptors.request.use((config) => {
  if (accessToken)
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${accessToken}`,
    };
  return config;
});

async function refreshAccessToken() {
  // Attempt cookie-based refresh (works when running from browser with credentials)
  try {
    const res = await API.post("/auth/refresh", {}, { withCredentials: true });
    accessToken = res.data?.data?.accessToken;
    return accessToken;
  } catch (err) {
    // fallback: if test harness returns refresh token in body, use that
    throw err;
  }
}

// Example: on 401, call refreshAccessToken and replay request (omitted for brevity)
```

Curl basics (login and use cookie jar):

```bash
# login (stores refreshToken cookie in cookies.txt)
curl -X POST "${BASE}/auth/login" -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"secret123"}' -c cookies.txt

# call protected endpoint using Authorization header (use accessToken returned from login JSON)
curl -H "Authorization: Bearer <ACCESS_TOKEN>" "${BASE}/auth/me"

# refresh using cookie (may require CSRF header depending on deployment)
curl -X POST "${BASE}/auth/refresh" -b cookies.txt -c cookies.txt
```

---

## 3. Common response formats

- Success envelope (typical):

```json
{ "success": true, "data": <payload> }
```

- Error envelope (typical):

```json
{ "success": false, "error": "message", "code": "ERROR_CODE", "details": null }
```

- Validation errors use HTTP 422 with `fieldErrors` in the response body.

---

## 4. Endpoints (concrete examples)

Note: All endpoints below are mounted under `${BASE}`. Replace `${BASE}` with your environment URL.

### Auth (public)

- POST /auth/register
  - Purpose: Create account
  - Auth: none
  - Body (JSON):

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "strongpassword",
  "phone": "01012345678"
}
```

- Example curl:

```bash
curl -X POST "${BASE}/auth/register" -H "Content-Type: application/json" -d '{"name":"Alice","email":"alice@example.com","password":"strongpassword","phone":"01012345678"}'
```

- Success 201:

```json
{
  "success": true,
  "data": {
    "userId": "<uuid>",
    "message": "Account created. Please check your email to verify your account."
  }
}
```

- Errors: 422 (validation), 409 (unique email)

- GET /auth/verify-email?token=<token>
  - Purpose: Confirm email and sign-in
  - Auth: none
  - Path/Query: `token` (required)
  - Example:

```bash
curl "${BASE}/auth/verify-email?token=<token>" -i -c cookies.txt
```

- Behavior: Sets `refreshToken` cookie and returns `accessToken` and `user` in response `data`.

- POST /auth/resend-verification
  - Purpose: Re-send verification email
  - Body: `{ "email": "user@example.com" }`

- POST /auth/login
  - Purpose: Authenticate and set refresh cookie
  - Body:

```json
{ "email": "alice@example.com", "password": "strongpassword" }
```

- Example:

```bash
curl -X POST "${BASE}/auth/login" -H "Content-Type: application/json" -d '{"email":"alice@example.com","password":"strongpassword"}' -c cookies.txt
```

- Success 200: `{ success:true, data: { accessToken: "<jwt>", user: { id, email, role, businessId } } }` and server sets `refreshToken` cookie.

- POST /auth/refresh
  - Purpose: Exchange refresh token for a new access token
  - Auth: none (but CSRF protected when using cookies)
  - Use one of:
    - Cookie flow: send cookie `refreshToken` (`curl -b cookies.txt -c cookies.txt`) — make sure to include CSRF token if deployment requires it
    - Body flow (testing only): `{ "refreshToken": "<token>" }` — server will accept if configured
  - Example (cookie):

```bash
curl -X POST "${BASE}/auth/refresh" -b cookies.txt -c cookies.txt
```

- Success: `{ success:true, data: { accessToken: "<jwt>" } }` and cookie renewed.

- POST /auth/logout
  - Purpose: Revoke refresh token and clear refresh cookie
  - Auth: CSRF protected (cookie)
  - Example:

```bash
curl -X POST "${BASE}/auth/logout" -b cookies.txt -c cookies.txt
```

- POST /auth/forgot-password
  - Body: `{ "email":"user@example.com" }` → sends reset link (returns sent flag)

- POST /auth/reset-password
  - Body: `{ "token":"<token>", "password":"newPass123" }`

- GET /auth/me
  - Purpose: Get current user
  - Auth: Bearer access token required
  - Example:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" "${BASE}/auth/me"
```

### Business (`/businesses`)

- POST /businesses
  - Create a business (authenticated user must be logged in)
  - Body (example):

```json
{
  "name": "Acme Salon",
  "slug": "acme-salon",
  "phone": "01234567890",
  "vertical": "salon",
  "address": "1 Main St",
  "city": "Cairo"
}
```

- Success 201: returns created business, updated user and access token.

- GET /businesses/check-slug/:slug
  - Public; checks slug availability
  - Example:

```bash
curl "${BASE}/businesses/check-slug/acme-salon"
```

- Response: `{ "available": true, "slug": "acme-salon" }`

- GET /businesses/public/:slug
  - Public: returns full website data for public site (websiteContent, services, staff, faqs)

- PATCH /businesses/:id
  - Auth: requireBusinessAccess (owner/admin)
  - Body: partial business fields (name, phone, address, city, vertical, timezone, language)

- PATCH /businesses/:id/publish
  - Body: `{ "isActive": true }`

- GET /businesses/:id/stats
  - Returns customersCount, appointmentsCount, servicesCount, staffCount

### Website Content (`/website-content`)

- GET /website-content
  - Returns websiteContent for the authenticated user's business

- PATCH /website-content
  - Body: website content fields (tagline, aboutText, template, colors, flags)

### Staff (`/staff`)

- GET /staff
  - List staff for current business (auth required)

- POST /staff
  - Create staff: `{ "name":"Sara", "role":"Staff", "photoUrl":"https://..." }`

- PATCH /staff/:id
  - Update staff

- DELETE /staff/:id

- POST /staff/:id/services
  - Assign service: body contains `serviceId` (controller expects `req.body.serviceId`)

- DELETE /staff/:id/services/:serviceId

- GET /staff/:id/availability
  - Returns availability objects

- PUT /staff/:id/availability
  - Replace availability with array of entries
  - Entry example:

```json
[
  {
    "dayOfWeek": 1,
    "startTime": "2026-05-17T09:00:00Z",
    "endTime": "2026-05-17T17:00:00Z",
    "breakAfterMin": 30
  }
]
```

- POST /staff/:id/availability/overrides
  - Add override: `{ "overrideDate":"2026-06-01","isDayOff":true }`

- DELETE /staff/:id/availability/overrides/:overrideId

- POST /staff/invites
  - Create invite: `{ "email":"invitee@example.com","role":"Receptionist","expiresInDays":7 }`

- POST /staff/invites/accept
  - Accept invite: `{ "token": "<token>" }` (must be logged-in user with matching email)

### Services (`/services`)

- GET /services
  - List services for business

- POST /services
  - Body:

```json
{ "name": "Haircut", "durationMin": 30, "priceEgp": 150.0 }
```

- PATCH /services/:id

- DELETE /services/:id

### Customers (`/customers`)

- GET /customers?search=&page=
  - Paginated list: returns `{ items, total, page, perPage }`

- GET /customers/:id

- PATCH /customers/:id/notes
  - Body: `{ "notes":"Preferred morning" }`

- GET /customers/:id/appointments

### Public booking (`/booking`)

- GET /booking/availability?businessId=&serviceId=&date=&staffId?&timezone?
  - Public endpoint returning available slots for a date
  - Example response item: `{ "time":"2026-06-01T09:00:00Z", "staffId":"...","durationMin":30 }`

- POST /booking
  - Create booking (public). Body example:

```json
{
  "businessId": "<uuid>",
  "serviceId": "<uuid>",
  "staffId": null,
  "startsAt": "2026-06-01T09:00:00Z",
  "timezone": "Africa/Cairo",
  "customerName": "Ahmed",
  "customerPhone": "01012345678",
  "notes": "VIP"
}
```

- Success 201: `{ success:true, data: { appointment: {...}, customer: {...} } }`

- GET /booking/confirm/:token
  - Confirm booking by token

- POST /booking/cancel/:token
  - Cancel booking by token (token TTL defaults to 30 days)

### Appointments (`/appointments`)

All appointment routes require authentication (`requireAuth`). Some routes require role checks (`BusinessAdmin`, `Receptionist`) or `requireAppointmentOwnerOrAdmin`.

- GET /appointments?date=&from=&to=&page=&perPage=
  - List appointments (paginated). Items include `customer`, `service`, `staff` (masked for non-owners in some cases).

- POST /appointments
  - Create manual appointment (admin/receptionist). Body similar to booking create but sets status confirmed.

- PATCH /appointments/:id/reschedule
  - Body: `{ "startsAt":"new-date" }` → returns updated appointment or 409 SLOT_TAKEN

- GET /appointments/:id

- PATCH /appointments/:id/status
  - Body: `{ "status":"confirmed" }` (see AppointmentStatus enum)

- PATCH /appointments/:id/notes
  - Body: `{ "notes":"..." }`

### FAQs (`/faqs`)

- GET /faqs
- POST /faqs
  - Body: `{ "question":"Q","answer":"A","displayOrder":0 }`
- PATCH /faqs/:id
- DELETE /faqs/:id
- PATCH /faqs/reorder
  - Body: array of `{ id: "<uuid>", display_order: <int> }`

### Photos (`/photos`)

Uploads use `multipart/form-data` field `file`. Max size 5MB.

- POST /photos/logo
- POST /photos/cover
- POST /photos/gallery
  - Example curl:

```bash
curl -X POST "${BASE}/photos/logo" -H "Authorization: Bearer <ACCESS_TOKEN>" -F "file=@./logo.png" -F "businessId=<BUSINESS_ID>"
```

- DELETE /photos/gallery/:id

### Billing (`/billing`)

- POST /billing/trial
  - Body: `{ "businessId":"<uuid>","planId":"<uuid>" }` → starts a trial

- POST /billing/checkout
  - Body same as trial → returns `{ data: { payment, subscription } }`. NOTE: This endpoint
    is used for Hgezli subscription billing (business owners paying Hgezli). All customer-facing
    payments (invoices created via `/invoices/checkout`) are Cash On Delivery (COD) and do not
    integrate with payment gateways.

- POST /billing/webhook
  - Webhook endpoint used by Paymob. No auth — server verifies signature. Frontend does not call this.

### Docs & metrics

- GET /docs — Swagger UI
- GET /docs/openapi.json — raw OpenAPI document
- GET /metrics — Prometheus metrics (text)

---

## 5. Data models (brief)

See `prisma/schema.prisma` for canonical models. Key entities:

- Business: id, name, slug, phone, isActive, timezone, websiteContent (relation)
- BusinessUser: id, email, passwordHash, role (enum Roles)
- Staff: id, businessId, name, role, isActive
- Service: id, businessId, name, durationMin, priceEgp
- Customer: id, businessId, name, phone, email
- Appointment: id, businessId, staffId, serviceId, customerId, startsAt, endsAt, status (AppointmentStatus enum)

Enums:

- `Roles`: SuperAdmin, BusinessAdmin, Staff, Receptionist, User
- `AppointmentStatus`: pending, confirmed, cancelled_by_customer, cancelled_by_business, no_show, completed

---

## 6. Integration & testing checklist (ready-to-run)

Follow these steps to validate a deployment; these commands are ready to be executed by a CI job or an AI agent.

1. Start server and ensure `APP_URL` and `FRONTEND_URL` set correctly.
2. Run health check:

```bash
curl "${BASE}/health"
```

3. Register a test user and confirm email (if you can't inspect email, the test harness can stub `sendVerificationEmail` or read worker queue if implemented):

```bash
curl -X POST "${BASE}/auth/register" -H "Content-Type: application/json" -d '{"name":"Test","email":"test+ci@example.com","password":"testPass123","phone":"01012345678"}'
```

4. Login and store cookies:

```bash
curl -X POST "${BASE}/auth/login" -H "Content-Type: application/json" -d '{"email":"test+ci@example.com","password":"testPass123"}' -c cookies.txt
```

5. Call protected route using returned access token from login response:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" "${BASE}/auth/me"
```

6. Create business (auth required):

```bash
curl -X POST "${BASE}/businesses" -H "Content-Type: application/json" -H "Authorization: Bearer <ACCESS_TOKEN>" -d '{"name":"CI Biz","slug":"ci-biz-1","phone":"01234567890"}'
```

7. Create service, staff, and test booking flow (use public booking endpoints to verify slot generation and create booking). See endpoints above.

8. Test appointment conflict handling: create two overlapping bookings for same staff and expect `409 SLOT_TAKEN` for the second.

9. Test file uploads:

```bash
curl -X POST "${BASE}/photos/logo" -H "Authorization: Bearer <ACCESS_TOKEN>" -F "file=@./test/logo.png" -c cookies.txt
```

10. Validate metrics at `/metrics` and OpenAPI at `/docs/openapi.json`.

---

## 7. Error handling guidance for frontend

- 401: prompt login or trigger refresh flow.
- 403: show permission denied.
- 409 SLOT_TAKEN: show booking conflict and refresh slots.
- 422: display form validation errors from `fieldErrors` in response.
- 429: implement exponential backoff and show user-friendly message.

---

## 8. Notes for AI agents / automation

- The `API_DOCUMENTATION.md` is intentionally machine-friendly: it uses consistent JSON examples, explicit endpoint lists, and curl snippets that can be executed by an agent.
- If the agent runs into CSRF errors during refresh/logout cookie flows, it should either use the access token from login or request a test-mode endpoint (if available) that bypasses CSRF. Alternatively, the agent can be given a non-HttpOnly copy of the refresh token for CI testing.

---

If you want, I can also generate a Postman collection or an OpenAPI fragment derived from these definitions.
