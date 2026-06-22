# Hgezli — Workflow Guide

This document explains the major user flows, background jobs, and integration points in the Hgezli project. It is written for frontend engineers and automation agents to understand sequence, side-effects, and where to test.

## High-level flows

### 1) User registration and onboarding

1. User submits `POST /auth/register` with name, email, password, phone.
2. Backend creates a BusinessUser record (password hashed) and enqueues a verification email via the email service.
3. User clicks the verification link (frontend opens URL `/verify-email?token=...`) which calls `GET /auth/verify-email?token=<token>`.
4. Server verifies token, creates refresh token (cookie) and returns an access token (`accessToken`). Frontend stores `accessToken` in memory and receives cookie for refresh flows.
5. For first-time user needing a business: frontend calls `POST /businesses` to create a business and receives updated user role + a new access token.

Key points for frontend:

- Present clear verification UI with instructions to check email.
- Use accessToken for immediate API calls and rely on refresh cookie for silent refresh.

### 2) Booking (public customer flow)

1. Visitor selects business and service on the public site.
2. Frontend calls `GET /booking/availability?businessId=<>&serviceId=<>&date=YYYY-MM-DD` to list available slots.
3. Visitor chooses slot and submits `POST /booking` with customer name & phone.
4. Server upserts a `Customer` (by phone) and creates an `Appointment` with status `pending` or `confirmed` depending on booking type.
5. Server returns `appointment` and `customer` objects; server enqueues reminder notifications and optionally sends confirmation emails/SMS.

Edge cases & constraints:

- Concurrency: server enforces conflict checks and will return `409 SLOT_TAKEN` for concurrent attempts. Frontend must refresh slots and show friendly error.
- Cancel: visitor may cancel via token-based link which maps to `POST /booking/cancel/:token`.

### 3) Admin workflows (business management)

1. Admin (BusinessAdmin or SuperAdmin) logs in and creates/manages services and staff (`/services`, `/staff`).
2. Admin adjusts staff availability (`/staff/:id/availability`) and sets overrides for day-offs.
3. Admin can create manual appointments (`POST /appointments`) or reschedule (`PATCH /appointments/:id/reschedule`).
4. Admin publishes their website via website setup flow (`/owner/businesses/:businessId/website-setup/publish`) which creates a public site visible at `/businesses/public/:slug`.

Notes:

- Role-based guards: `requireBusinessAccess` and `requireAppointmentOwnerOrAdmin` protect sensitive actions.
- When staff members are added via invites, the invite email must be accepted by a logged-in user with matching email.

### 4) Billing & subscription

1. Admin can start a trial via `POST /billing/trial`.
2. To subscribe, admin calls `POST /billing/checkout` which triggers Paymob integration and returns payment info.
3. Paymob calls `/billing/webhook` with payment notifications; backend validates signature and updates `Subscription` status.

### 5) Background jobs & worker

- Worker (`src/worker.ts`) runs scheduled jobs:
  - Reminder job: send reminders before appointments (in `queues/emailQueue.ts`)
  - Marking no-shows: scans ended appointments and marks `no_show` status
  - Email delivery and retry handling via BullMQ

Important behaviors for integration tests:

- Reminders and emails are enqueued asynchronously — tests should either poll queue status or run worker in test harness to flush jobs.

## Typical full integration test scenario

1. Register test account → call `/auth/register`.
2. Use email service dev mode or inspect email queue to retrieve verification token.
3. Call `/auth/verify-email?token=` to obtain access token and cookies.
4. Create business, services, staff.
5. Use public availability endpoint to fetch slots, create booking.
6. Run worker to process reminders (if applicable) and verify that ReminderLog and SmsLog entries are created.

## Useful troubleshooting checklist for CI/agents

- If `429` errors appear: respect rate limit and retry with exponential backoff.
- If CSRF errors appear on refresh/logout: obtain CSRF token from server (implementation-specific) or use access token flows.
- If emails are not arriving during tests: use the local email logger or inspect the email queue (Redis/BullMQ) instead of external providers.

---

This `workflow.md` is intentionally short and process-focused: hand this to an automation agent and it can run the ordered steps for end-to-end validation.
