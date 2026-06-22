# PROJECT SNAPSHOT

Generated: 2026-06-21

---

## 1. SCHEMA AS-BUILT

**Enums**

- `AppointmentStatus` — lifecycle states for appointments (pending, confirmed, cancelled_by_customer, cancelled_by_business, no_show, completed) — used by appointments routes/services
- `Roles` — RBAC levels (SuperAdmin, BusinessAdmin, Staff, Receptionist, User) — used by auth middleware across all protected routes

**Models**

- `Business` — core tenant record (name, slug, vertical, timezone, language, logo/cover, active flag) — business routes, appointments, customers, staff, services, faqs, subscription, website-content, website-setup
- `BusinessUser` — auth identity for business staff/owners (email/password, role, refresh tokens, provider linking) — auth routes, billing, all `requireAuth` middleware
- `Staff` — employee record per business (name, role, photo, active flag, working relations) — staff routes, appointments, availability, service assignments
- `StaffInvite` — pending invitation token for joining a business — staff routes (invites)
- `Service` — offerable service (name, duration_min, price_egp, description) — services routes, appointments, staff assignments
- `ServiceStaff` — join table linking services to staff — services/staff routes
- `Availability` — weekly recurring schedule per staff (day_of_week + start/end time) — staff routes
- `AvailabilityOverride` — date-specific overrides (day off or custom hours) — staff routes
- `Customer` — business customer (name, phone, email unique per business, visit/no-show counts, notes) — customers routes, appointments
- `Appointment` — booking record (staff, service, customer, times, status, reminder flags, cancel token, sms logs) — appointments routes, bookings routes, no-show job
- `WebsiteContent` — public website customization (tagline, about, template, colors, font, custom domain, section visibility, seo meta) — website-content routes, public website rendering
- `WebsiteSetup` — owner-facing website builder state (step, template, draft envelope, site draft, publish state) — website-setup routes
- `Faq` — per-business FAQ entries (question, answer, display_order) — faqs routes
- `Plan` — subscription plan catalog (name, price_egp, limits, feature flags like sms_reminders, custom_domain) — billing routes, subscription creation
- `Subscription` — business subscription to a plan (status, periods, Paymob subscription id, trial notification flags) — billing routes, Paymob webhook handler
- `SmsLog` — audit log for SMS sends tied to appointments (phone, message_type, status, gateway_id, error, sent_at) — SMS service (referenced but actual sending implementation incomplete)
- `RefreshToken` — rotation-based refresh token storage (token, revoked, expiry, user relation) — auth refresh/logout flow
- `ReminderLog` — deduplication/state tracking for appointment reminders (when_key, channel, status) — jobs/reminder.job.ts

**Notable absences from schema**

- No `Photo` / `Gallery` model — photos module only uploads to blob storage; gallery list/delete endpoints are stubbed.
- No `Invoice` model — checkout/Paymob integration does not create invoices.
- No `Review` model — `WebsiteContent.showReviews` exists but there is no review entity or endpoint.

---

## 2. ENDPOINTS THAT EXIST

### Health / Docs

- `GET /health` — fully working

### Auth (`/auth`)

- `POST /auth/register` — fully working
- `GET /auth/verify-email` — fully working
- `POST /auth/resend-verification` — fully working
- `POST /auth/login` — fully working
- `GET /auth/oauth/google` — fully working (redirect)
- `GET /auth/oauth/google/callback` — fully working
- `GET /auth/oauth/apple` — fully working (redirect)
- `POST /auth/oauth/apple/callback` — fully working
- `POST /auth/refresh` — fully working
- `POST /auth/logout` — fully working
- `POST /auth/forgot-password` — fully working
- `POST /auth/reset-password` — fully working
- `GET /auth/me` — fully working

### Businesses (`/businesses`)

- `POST /businesses/` — fully working
- `GET /businesses/check-slug/:slug` — fully working
- `GET /businesses/public/:slug` — fully working (public data)
- `PATCH /businesses/:id` — fully working
- `PATCH /businesses/:id/publish` — fully working
- `GET /businesses/:id/stats` — fully working

### Website Content (`/website-content`)

- `GET /website-content` — fully working
- `PATCH /website-content` — fully working

### Staff (`/staff`)

- `GET /staff` — fully working
- `POST /staff` — fully working
- `PATCH /staff/:id` — fully working
- `DELETE /staff/:id` — fully working
- `POST /staff/:id/services` — fully working
- `DELETE /staff/:id/services/:serviceId` — fully working
- `GET /staff/:id/availability` — fully working
- `PUT /staff/:id/availability` — fully working
- `POST /staff/:id/availability/overrides` — fully working
- `DELETE /staff/:id/availability/overrides/:overrideId` — fully working
- `POST /staff/invites` — fully working
- `POST /staff/invites/accept` — fully working

### Services (`/services`)

- `GET /services` — fully working
- `POST /services` — fully working
- `PATCH /services/:id` — fully working
- `DELETE /services/:id` — fully working

### Customers (`/customers`)

- `GET /customers` — fully working
- `GET /customers/:id` — fully working
- `PATCH /customers/:id/notes` — fully working
- `GET /customers/:id/appointments` — fully working

### FAQs (`/faqs`)

- `GET /faqs` — fully working
- `POST /faqs` — fully working
- `PATCH /faqs/:id` — fully working
- `DELETE /faqs/:id` — fully working
- `PATCH /faqs/reorder` — fully working

### Photos (`/photos`)

- `POST /photos/logo` — fully working (upload)
- `POST /photos/cover` — fully working (upload)
- `POST /photos/gallery` — partially stubbed (upload likely stores file but no Photo model/tracking)
- `DELETE /photos/gallery/:id` — **stubbed** — returns `NOT_IMPLEMENTED`

### Public Bookings (`/booking`)

- `GET /booking/availability` — fully working
- `POST /booking` — fully working (public)
- `GET /booking/confirm/:token` — fully working
- `POST /booking/cancel/:token` — fully working

### Appointments (`/appointments`)

- `GET /appointments` — fully working
- `POST /appointments` — fully working
- `PATCH /appointments/:id/reschedule` — fully working
- `GET /appointments/:id` — fully working
- `PATCH /appointments/:id/status` — fully working
- `PATCH /appointments/:id/notes` — fully working

### Billing (`/billing`)

- `POST /billing/trial` — fully working
- `POST /billing/checkout` — fully working (returns Paymob payment payload)
- `POST /billing/webhook` — fully working (Paymob callback)

### Website Setup (`/owner/businesses/:businessId`)

- `GET /owner/businesses/:businessId/website-setup` — fully working
- `PUT /owner/businesses/:businessId/website-setup` — fully working
- `POST /owner/businesses/:businessId/website-setup/publish` — fully working
- `GET /owner/businesses/:businessId/slug-availability` — fully working
- `PATCH /owner/businesses/:businessId/site-draft` — fully working

### Docs (`/docs`)

- `GET /docs/openapi.json` — fully working
- `GET /docs/` — fully working (Swagger UI)

---

## 3. WHAT'S NOT BUILT YET

- `Photo` model does not exist in `schema.prisma` yet — gallery endpoints return stubs / no persistence
- Gallery list endpoint does not exist (only upload + delete placeholder)
- `Invoice` model does not exist in `schema.prisma` yet
- No invoice generation, PDF download, or invoice email endpoints
- No checkout success / failure page or redirect confirmation endpoints for the frontend payment flow
- ETA e-receipt integration not started
- SMS sending implementation appears incomplete (`SmsLog` records are created but actual gateway integration is not present)
- No actual email provider integration (emails are queued but mailer config/service not implemented)
- No review submission or management endpoints (despite `showReviews` in `WebsiteContent`)
- No analytics/reporting endpoints
- No bulk operations endpoints (bulk import customers, bulk staff updates, etc.)
- No file deletion cleanup for old logos/covers on update

---

## 4. KNOWN ISSUES / TECH DEBT

- **Paymob webhook HMAC verification**: `paymob.verifyWebhook` is called with `req.body` (already parsed JSON), but raw body is required for HMAC signature verification. If Express has body-parser enabled, the computed HMAC will not match Paymob's signature, effectively bypassing webhook authenticity checks.
- **In-memory rate limiting**: `express-rate-limit` stores counters in process memory. In a multi-instance deployment (Docker, multi-PM2, etc.), each instance enforces its own window, allowing clients to bypass limits by rotating instances. Should use Redis-backed rate limiting (e.g., `rate-limit-redis`).
- **NoShow cron job**: registered and produces logs, but `appointments.markNoShows()` implementation was not reviewed; if it relies on strict time-window matching in a single timezone, it may under/over-mark no-shows across timezones.
- **Availability schema anti-pattern**: `startTime` and `endTime` are `DateTime` columns for what is logically time-of-day recurring availability. This forces clients to pass bogus dates and makes queries/comparisons more error-prone than `Time` type.
- **Booking → Appointment gap**: Public booking creates a `Customer` if needed and links to `Appointment`, but the appointments list/search for that new appointment may not be immediately queryable if the transaction is split.
- **Stubbed photos.gallery.delete**: endpoint exists but explicitly returns `NOT_IMPLEMENTED`; frontend calling it will get a non-error success response with no actual deletion, leading to stale UI state.
- **Business active default false**: new businesses default to `isActive: false`; nothing in the registration/signup flow flips this to true after successful onboarding, so businesses may remain inactive indefinitely without explicit publish.
- **`requireBusinessAccess` coupling**: relies on `req.user.businessId` being present; any token issued without a `businessId` context will fail authorization rather than returning a clear user-facing error.
- **No input sanitization beyond Zod**: rich-text / long text fields (notes, FAQ answers, aboutText) are stored as-is; no sanitization against XSS if rendered in the website module.

---

## 5. RECENT CHANGES

From `git log` (HEAD to older):

- `fc90b770` — add/ get all businesses
- `823c5a8e` — business creation and websitecontent upsertion
- `62e21d82` — reseting to last working code
- `a517429d` — copilot changes
- `d93f1366` — codex changes again with debugging
- `b2b7f4c4` — harcode url
- `1062827e` — codex refactor
- `c6c10422` — codex changes
- `3b5b11ff` — debugging
- `84085d6a` — without cookies

Recent work focused on business creation, website content upsertion, and various debugging/refactor cycles. The billing/Paymob flow, staff/invites, and website-setup module appear to be the most recently active based on readable commit messages.
