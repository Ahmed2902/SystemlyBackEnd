# PHASE_STATUS.md

Last updated: 2026-06-22

## Phase 0a — Fix before building

Status: COMPLETE

- [x] Paymob webhook raw body fix
- [x] Gallery delete fake-success fix
- [x] Business.isActive flip path verified/fixed

## Phase 0 — Financial core

Status: COMPLETE

- [x] Invoice model added
- [x] InvoiceLineItem model added
- [x] SmsLog renamed to NotificationLog with channel enum
- [x] Customer.email constraint confirmed as @@unique([businessId, email])
- [x] Photo model added for gallery

## Phase 1 — Cash checkout flow

Status: COMPLETE

- [x] POST /invoices/checkout
- [x] PATCH /invoices/:id/mark-paid
- [x] ETA e-receipt background job
- [x] GET /invoices/:id/receipt (PDF)

- Checkout endpoint
  shared
  Why: Why this matters: your Appointment model is fully functional — you can book, reschedule, cancel, mark status. But finishing an appointment currently produces nothing financial. This endpoint is the bridge: it's the moment a completed haircut or checkup becomes a billable, trackable transaction.
  How: POST /appointments/:id/checkout reads the linked Service.priceEgp, creates an Invoice with status issued and a matching InvoiceLineItem, and returns the invoice to the frontend for display. This should run inside a Prisma transaction ($transaction) so the invoice and line item are created atomically — you never want an invoice that exists without its line items, or vice versa.
  Risk if skipped: If skipped: appointments complete with no financial record at all, making analytics, loyalty, and commissions all impossible since they all read from Invoice.

- Mark-as-paid endpoint
  shared
  Why: Why this matters: since there's no payment gateway in the loop, your software has no automatic way of knowing cash changed hands — a human has to tell it. This endpoint is that explicit human action, and it's the only state transition Invoice needs beyond creation.
  How: PATCH /invoices/:id/mark-paid sets status to paid and paidAt to the current timestamp. Keep this endpoint deliberately simple — no partial payments, no payment method selection, since you've decided cash-only removes the need for that complexity entirely.
  Risk if skipped: If skipped: invoices stay in 'issued' limbo forever, and any reporting that filters on status: paid (loyalty point earning, daily revenue totals) sees nothing.

- ETA e-receipt background job
  shared
  Why: Why this matters: Egyptian tax law requires an e-receipt for sales regardless of how the customer paid cash sales are not exempt. This is a compliance requirement for the businesses using your platform, not an optional nice-to-have feature.
  How: Trigger this as a BullMQ job the moment an invoice is marked paid, not synchronously inside the mark-paid request. Government APIs are often slow or occasionally down — if you call the ETA API synchronously and it hangs, your checkout flow hangs with it, and a receptionist standing at the counter with a waiting client is the worst possible moment for that. The job writes etaReceiptUid and etaSubmittedAt back onto the Invoice once it succeeds, with retry logic for transient failures.
  Risk if skipped: If skipped: businesses using your platform are not legally compliant, which is a liability for them and a trust problem for you if it surfaces during a sales conversation with a more cautious clinic owner.

- Printable receipt
  shared
  Why: Why this matters: without a card terminal printing a receipt, the client needs something physical or shareable to walk away with — partly for their own record, partly because it's the expected social norm of a transaction completing.
  How: GET /invoices/:id/receipt renders the Invoice and its line items into a PDF on demand (no need to store the PDF — generate fresh each time it's requested, since the underlying data won't change after status is paid). This can reuse whatever PDF library you're already comfortable with in Node — no new infrastructure required.
  Risk if skipped: If skipped: lower priority than the other three — checkout still functions without this, it's a polish item rather than a blocker.

## Phase 2 — Shared appointment modules

Status: PARTIALLY STARTED

- [x] No-show cron job (exists — needs timezone review, not rebuild)
- [x] Reminder deduplication (ReminderLog — working)
- [ ] No-show timezone logic reviewed
- [ ] Client history view extended with invoice data
- [ ] Loyalty points
- [ ] Staff commission calculation
- [ ] Analytics dashboard (check existing GET /businesses/:id/stats first)

## Phase 3 — Plug-in mechanism

Status: NOT STARTED

- [ ] VerticalConfig (or static config) defining enabled modules per vertical
- [ ] Code review rule enforced: plug-in tables attach via FK, never new
      columns on shared tables (Appointment, Invoice, Customer, Business)

## Phase 4 — Salon plug-in

Status: NOT STARTED

- [ ] AppointmentPhoto (before/after gallery)
- [ ] Package + CustomerPackage (pre-paid bundles)
- [ ] Staff.isFreelancer (chair rental commission mode)

## Phase 5 — Clinic plug-in

Status: NOT STARTED

- [ ] ClinicVisitRecord (specialty EMR fields)
- [ ] InsuranceClaim
- [ ] ClinicVisitRecordHistory (GAHAR audit trail, append-only)

---

## DEFERRED (explicit decisions, do not re-propose)

- WhatsApp Business API — deferred until ~80-120 paying customers.
  Use wa.me pre-filled links (manual tap-to-send) until then.
- Fawry / Vodafone Cash / any client-to-business payment gateway —
  NOT NEEDED. Payment is cash-on-delivery only. The only real payment
  gateway in this system is Subscription + Paymob (business owner
  paying Hgezli for their own subscription).
- Multi-country support — Egypt only, intentional, not a gap.

## KNOWN ISSUES not yet scheduled (monitor, fix before scale)

- In-memory rate limiting (express-rate-limit) — fine on single instance,
  becomes a bypass vector on multi-instance deployment. Move to Redis-backed
  (rate-limit-redis) before horizontal scaling.
- Availability.startTime/endTime use DateTime for what is logically
  time-of-day recurring data — works today, adds query complexity that
  will compound once vertical plug-ins also need time-of-day comparisons.
- No email provider integration — emails are queued via BullMQ but
  nothing actually sends. Needed before Phase 1 can email a receipt.
- No input sanitization on rich text fields (notes, FAQ answers,
  aboutText) rendered on the public website — potential XSS vector.
- Booking -> Appointment possible transaction gap between customer
  creation and appointment linkage — review, not confirmed as a live bug.
- No file cleanup on logo/cover replacement — orphaned Cloudinary files
  accumulate. Low priority, cost/cleanliness only.
