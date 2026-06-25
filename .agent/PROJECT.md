# PROJECT.md — Hgezli technical reference

This file is the single source of truth for any AI agent working on this
codebase. Read this in full before making schema changes, adding routes,
or making architectural decisions. If something here conflicts with what
you observe in the actual code, the code might be outdated relative to
a decision recorded here — flag the conflict rather than silently picking
one or the other.

---

## 1. What this product is

Hgezli is a SaaS platform for Egyptian service businesses, starting
with appointment-based verticals — salons, clinics, spas. Each
business gets:

- A public, bookable website (generated from a template, customizable)
- An admin dashboard to manage staff, services, customers, and money
- A scheduling engine clients use to book directly (currently a core
  part of the experience for the launch verticals, but see Layer 1.5
  in section 2 — this is treated as an optional module, not a
  permanent universal assumption, since future non-appointment
  verticals like retail won't need it)

The business model: businesses pay Hgezli a monthly subscription
(via Paymob). Hgezli does not process payments between the business
and its own clients — see section 5, Money flow, for why this matters
and what NOT to build.

Target market: Egypt only. This is intentional, not a gap to fill later.

---

## 2. Architecture — the three-layer mental model

Every schema and route decision should be checked against this model.
**Before adding any field, ask: "would this be needed by a clinic AND a
salon, with no other vertical-specific business yet imagined?"**

- **If yes and it's about identity, money, or the public website**
  → it belongs in Layer 1 (Core).
- **If yes but it's specifically about booking/scheduling** → Layer
  1.5, which is core to the current verticals but explicitly optional
  for future ones (see below).
- **If yes but it's something else specific to appointment-based
  businesses** (not core enough to apply to a hypothetical future
  non-appointment business type) → Layer 2 (Shared appointment modules).
- **If no, only one vertical needs it** → Layer 3 (Plug-in), and it
  must attach via a foreign key to a Layer 1/1.5/2 table. It must
  NEVER be a new column added directly onto a shared table.

### Layer 1 — Core (any business type, ever)

- Identity: `Business`, `BusinessUser`, `Staff`, `StaffInvite`, RBAC roles
- Money: `Invoice`, `InvoiceLineItem`, `Subscription`, `Plan`
- Public site: `WebsiteContent`, `WebsiteSetup`, `Faq`, `Photo`

### Layer 1.5 — Scheduling (optional core module, not universal)

- `Service`, `ServiceStaff`, `Availability`, `AvailabilityOverride`,
  `Appointment`
- **This is intentionally separated from the rest of Layer 1.**
  Scheduling/appointments is correct for the current target
  (salons, clinics, spas) but is NOT universal to every business type
  Hgezli might support later — a future retail business, for example,
  has no concept of booking a time slot at all. Treat scheduling as
  an optional module that a vertical can enable or skip via the
  Phase 4 vertical config (section 7), not as a hard dependency baked
  into core identity/money/website modules. Concretely: `Business`,
  `Invoice`, `Subscription`, and the website builder must never
  require a non-null `Appointment` or `Service` relation to function —
  a retail business should be able to issue an `Invoice` with no
  `appointmentId` at all, which the schema already supports
  (`Invoice.appointmentId` is nullable for exactly this reason).

### Scheduling engine design

Availability is generated from free intervals, not from forward-scanning
time slots.

For a given staff member and day:

1. Determine working hours from `Availability`.
2. Apply `AvailabilityOverride` if one exists.
3. Load all non-cancelled appointments for that day.
4. Convert appointments into busy intervals.
5. Extend busy intervals by `breakAfterMin`.
6. Merge overlapping or adjacent busy intervals.
7. Compute free gaps as the inverse of busy intervals within working
   hours.
8. Offer start times only where the full
   `service.durationMin + breakAfterMin`
   fits inside a free gap.

This interval-based approach avoids the inefficiencies and edge cases
of forward-scanning slot generation and scales better as appointment
volume grows.

Availability generation is read-only. Booking conflicts are always
validated again during appointment creation.

### Booking concurrency

Availability responses are advisory only.

A returned slot is never guaranteed to remain available.

Every booking creation request must perform a final overlap check
inside the same database transaction that creates the appointment.

If a conflict is detected:

HTTP 409
code: SLOT_TAKEN

The client must refresh availability and select another slot.

### Layer 2 — Shared appointment-business modules

- `Customer` (CRM: history, notes, visit/no-show counts)
- Loyalty points, staff commissions, analytics (planned, see section 7)
- `NotificationLog`, `ReminderLog`

### Layer 3 — Vertical plug-ins (one per business type)

- Salon: before/after gallery, package bundles
- Clinic: specialty EMR fields, insurance claims, GAHAR audit trail
- Any future vertical: same pattern, new tables, zero changes to
  Layers 1–2

**The one rule that protects this architecture forever:** a plug-in
table references `Appointment.id` or `Invoice.id` via foreign key.
It never adds a nullable column to `Appointment`, `Invoice`,
`Customer`, or `Business` for something only one vertical needs.
Violating this rule is the most likely way this codebase degrades
into unmaintainable spaghetti as more verticals get added — treat it
as a hard constraint, not a style preference.

---

## 3. Tech stack

- **Backend:** Node.js, Express, Prisma ORM, PostgreSQL (hosted on
  Supabase), BullMQ for background jobs, Redis (Upstash) as the
  BullMQ backing store
- **Frontend:** Next.js, React, deployed on Vercel (two separate
  frontend projects — one for the admin dashboard, one for public
  business sites, or however the actual split is structured — verify
  against the real repo if unclear)
- **File storage:** Cloudinary
- **Email:** Nodemailer with Brevo as the SMTP provider (queued via
  BullMQ, but per the latest project snapshot the actual sending
  implementation may still be incomplete — verify before assuming
  emails are being delivered)
- **Hosting:** Railway (backend), Vercel (frontend)
- **Auth:** Email/password with email confirmation (not OTP), plus
  Google and Apple OAuth. JWT-based with refresh token rotation.
- **Billing (Hgezli's own subscription revenue):** Paymob

---

## 4. Localization — English and Arabic from the start

Egypt-based, but the target verticals (salons, clinics, spas) skew
toward an educated, often bilingual customer and owner base. Decision:
**build the public website and admin dashboard to support both English
and Arabic from the start, not Arabic-only with English bolted on
later.** Treat English as a fully first-class language, not a
fallback — do not assume Arabic is always the primary language a
given business or customer prefers.

- `Business.language` already exists in the schema (`default("ar")`)
  — this is the business owner's preferred admin dashboard language,
  not necessarily the language their public website should default to
  for visitors. These are two separate concerns and should not share
  one field if they end up needing independent control later — check
  whether the business owner's dashboard language preference and the
  default public-site visitor language are actually meant to be the
  same setting, or whether `WebsiteContent` needs its own language
  field independent of `Business.language`.
- **Public website:** every business's public booking page should be
  toggleable between English and Arabic, with a clear language switch
  visible to visitors. `WebsiteContent` fields that hold actual
  business-authored text (`tagline`, `aboutText`, `metaTitle`,
  `metaDescription`) need to support both languages — this likely
  means either duplicate fields per language
  (`taglineEn`/`taglineAr`) or a JSON structure keyed by locale,
  decided before Phase 0 work touches `WebsiteContent` again, since
  retrofitting this onto live business data later is more disruptive
  than building it in from the start.
- **RTL layout:** Arabic requires genuine right-to-left layout, not
  just translated strings inside a left-to-right layout. This affects
  the frontend specifically — verify the Next.js frontend has a
  working RTL mode (CSS `direction: rtl`, mirrored spacing/icons)
  before assuming Arabic support is "done" once translation strings
  exist. A translated-but-not-mirrored layout looks visibly broken to
  Arabic readers and undermines trust at the exact moment a business
  is showing the product to a client.
- **`Faq`, `Service.name`, `Service.description`** and similar
  business-authored content fields face the same bilingual problem as
  `WebsiteContent` — a service named "Haircut" needs an Arabic
  equivalent if the business wants to serve Arabic-speaking visitors,
  and vice versa for a business that's Arabic-first wanting to reach
  English-speaking clients. Decide the storage pattern (duplicate
  columns vs. JSON-by-locale) once, and apply it consistently across
  every bilingual field rather than solving it differently per table.
- **Admin dashboard:** business owners and staff should be able to use
  the admin dashboard in either language regardless of which
  language their public website displays in — an English-speaking
  clinic owner shouldn't be forced into an Arabic admin UI just
  because their patients are Arabic-speaking, and vice versa.
- **Do not assume Arabic-only is sufficient** based on `Business.language`
  defaulting to `"ar"` in the schema — that default reflects an
  initial assumption, not a final decision. Build the language
  switching mechanism to be genuinely bilingual from the first
  release, since retrofitting a second language into hardcoded
  English or Arabic strings later touches every screen in both the
  admin dashboard and public website.

---

## 5. Money flow — read this before touching anything billing-related

There are exactly two money relationships in this system. Do not
conflate them, and do not build infrastructure for a third one unless
explicitly instructed.

### Relationship A — Business pays Hgezli (real payment gateway)

- Table: `Subscription`, `Plan`
- Gateway: Paymob
- This is the only place an actual payment processor is integrated.
- `Subscription.paymobSubscriptionId` links to Paymob's record.

### Relationship B — Client pays Business (cash only, no gateway)

- Table: `Invoice`, `InvoiceLineItem`
- Payment method: **cash on delivery, always.** No Fawry, no Vodafone
  Cash, no card terminal, no online payment of any kind between a
  client and the business they're booking with. This is the current
  state of the product — Visa/card payment may be added later once
  enough paying customers explicitly ask for it, but that is a future
  decision requiring explicit sign-off, not something to build
  speculatively now (see decisions log, section 10).
- `Invoice.status` lifecycle: **`draft → sent → paid`** (or `voided`).
  There is no `overdue` status and no `dueAt`-driven dunning logic —
  **a due date implies the client owes money over time, which doesn't
  apply to cash-on-delivery.** The client pays in full, in person, at
  the moment of service. A staff member taps "mark as paid" to record
  that fact; there is nothing to chase up later. If `dueAt` or
  `overdue` appear in the live schema or code, they are leftover from
  an earlier draft and should be removed, not built around.
- There is no `Payment` table and no partial-payment state — cash is
  collected in full in a single transaction.
- **Do not build Fawry, Vodafone Cash, card processing, or any
  due-date/overdue/dunning logic for Relationship B unless explicitly
  instructed to reverse this decision.** If a future ticket asks for
  this (e.g. "add Visa payments"), treat it as a significant
  architecture change, not a small addition — flag it for human
  confirmation before starting.

### Why Invoice exists even though payment is just cash

Even with no gateway, a structured invoice is required for:

- ETA (Egyptian Tax Authority) e-receipt submission — a legal
  requirement for the business, regardless of how the client paid
- Daily revenue reconciliation for the business owner
- Staff commission calculations (Layer 2)
- Loyalty point accrual (Layer 2)
- Analytics (Layer 2 — see the dedicated Phase 3 analytics dashboard
  in section 7 for the full scope of what gets built on top of this)

---

### Revenue ownership

Revenue is considered earned only when:

Invoice.status = paid

All reporting, loyalty points, commissions, business revenue totals,
customer lifetime value calculations, and analytics dashboards must
read only from paid invoices unless a report explicitly states
otherwise.

Draft and sent invoices are operational records, not realized revenue.

## 6. Notifications — read this before touching messaging

- **Current state: no automated messaging exists.** The only
  mechanism today is manual `wa.me` pre-filled links — a staff member
  taps a link, WhatsApp opens with a message pre-written, they tap
  send themselves. This costs nothing and requires no API credentials.
  This is NOT a phase to build later — the `wa.me` link generation is
  a small utility that can be added incrementally wherever it's
  useful (booking confirmation screen, reminder list in the dashboard,
  etc.) without needing its own dedicated phase.
- **Full WhatsApp Business API integration is explicitly deferred —
  and deliberately NOT scheduled as an early phase at all.** This was
  reconsidered: rather than treating it as "Phase 5, do this once you
  hit 80-120 paying customers," it should be planned later as a
  single, well-designed big feature once there's real usage data on
  which message types (reminders vs. confirmations vs. marketing
  campaigns) actually matter to pilot businesses. Building it
  incrementally and early risks committing to the wrong message
  templates before Meta's template-approval process even matters yet.
  Treat this as **out of scope for the current 6-phase plan entirely**
  — it gets its own future planning pass, not a slot in the phase list
  below.
- `NotificationLog` (renamed from the legacy `SmsLog`) has a `channel`
  enum defaulting to `whatsapp_link` for exactly this reason. If you
  see a value of `sms` or references to an SMS gateway, that reflects
  an earlier, since-abandoned plan — treat `whatsapp_link` as the
  intended default unless a specific task says otherwise.
- `ReminderLog` exists separately to deduplicate reminder sends per
  appointment per "when" bucket (e.g. 24h-before, 2h-before) — this
  table is unrelated to which channel is used and should not be
  confused with `NotificationLog`.

---

## 7. Current build phases

This reflects the actual state as of the last project snapshot.
Update the checkboxes as work completes — do not let this drift out
of sync with reality, since a future agent session will trust this
file over re-deriving status from scratch.

### Phase 0a — Fix before building (DONE)

Bugs in existing, already-running code. Not new features. Must be
resolved before Phase 0 starts.

- [x] **Paymob webhook raw body verification.** The webhook handler
      currently verifies the HMAC signature against `req.body`, which has
      already been parsed into a JS object by Express's JSON middleware by
      the time the handler runs. Paymob signs the raw bytes it sends, not
      the parsed-and-reserialized version — these are not guaranteed to
      match. Fix: mount `express.raw({type: 'application/json'})` scoped
      only to the webhook route, registered before the app-wide
      `express.json()`. Compute HMAC against that raw buffer, then
      manually `JSON.parse()` it for the rest of the handler. This is a
      security issue — until fixed, webhook authenticity may not actually
      be verified, meaning a forged "payment succeeded" callback could be
      possible.
- [x] **Gallery delete fake-success bug.**
      `DELETE /photos/gallery/:id` returns HTTP 200 but does not delete
      anything (no `Photo` model exists yet to delete a row from, and
      Cloudinary cleanup isn't implemented). Fix: until the `Photo` model
      exists, return a real `501 Not Implemented` instead of a fake `200`,
      so frontend error handling triggers instead of false-success UI.
- [x] **Business.isActive flip path.** New businesses default to
      `isActive: false`. Verify whether `PATCH /businesses/:id/publish`
      sets it to `true`. If it already does, close this with no code
      change. If not, add it there.

### Phase 0 — Financial core (DONE — verify against this spec)

The real schema now has `Invoice` and `InvoiceLineItem` built. This
phase is recorded here as a checklist to verify what's built matches
the cash-on-delivery decision, not as a from-scratch task list.

- [x] `Invoice` model exists: `businessId`, `customerId`,
      `appointmentId` (nullable + unique — not every invoice originates
      from a booked appointment), `invoiceNumber`, `status` enum,
      `subtotalCents`/`taxCents`/`totalCents` as `Int` (not `Decimal` —
      see Conventions, section 9), `currency` (defaults `"EGP"`),
      `etaReceiptUid`, `etaSubmittedAt`, `paidAt`.
      **Action needed:** confirm `status` enum is `draft`/`sent`/`paid`/
      `voided` only — remove `overdue` if present, since cash-on-delivery
      has no concept of an overdue invoice. Confirm `dueAt` is either
      removed or simply unused/always-null — a due date implies money
      owed over time, which doesn't apply here.
- [x] `InvoiceLineItem` model exists: `invoiceId`, `description`,
      `serviceId` (nullable), `staffId` (nullable), `quantity`,
      `unitPriceCents`, `taxCents`, `totalCents`, plus a commission
      snapshot (`commissionType`, `commissionAmount`,
      `commissionEarnedCents`) copied from `ServiceStaff` at invoice time
      so a later change to a staff member's commission rate doesn't
      retroactively alter historical invoices. This snapshot pattern is
      good practice — keep it.
- [x] `SmsLog` → `NotificationLog` rename done, `channel` enum exists
      (`SMS`/`EMAIL`/`WHATSAPP`). See section 6 for which channel should
      actually be in active use today.
- [x] `Customer.email` uses `@@unique([businessId, email])` — fixed.
- [x] `Photo` model exists (`businessId`, `url`, `publicId`, `kind`,
      `position`).

### Phase 1 — Cash checkout flow (DONE — verify against this spec)

- [x] Checkout endpoint — reads `Service`/line item pricing, creates
      `Invoice` (status: `sent`) + `InvoiceLineItem` inside a Prisma
      `$transaction` (so invoice and line items are never created
      inconsistently — one without the other).
- [x] Mark-as-paid endpoint — sets `status: paid`, `paidAt: now()`.
      No payment method selection, no partial amounts — cash is collected
      in full, this is a single explicit confirmation. No due-date or
      overdue logic exists anywhere in this flow.
- [x] ETA e-receipt background job — triggered via Graphile-worker on
      mark-paid, NOT synchronously inside the request (government APIs
      can be slow; a hung request at checkout is the worst possible
      moment for a receptionist with a client waiting). Writes
      `etaReceiptUid` + `etaSubmittedAt` back onto `Invoice` on success,
      with retry logic for transient failures.
- [x] `GET /invoices/:id/receipt` — renders `Invoice` +
      `InvoiceLineItem` as a PDF on demand. No need to persist the PDF;
      regenerate fresh each time since the underlying data doesn't change
      once `status: paid`.

### Phase 2 — Shared appointment modules (IN PROGRESS — verify against this spec)

- [ ] No-show cron job exists (`markNoShows()`) — **needs a review
      pass, not a rebuild.** Verify it correctly compares appointment
      times using each `Business.timezone` rather than a hardcoded
      assumption, especially as multi-branch / multi-timezone businesses
      become possible later.
- [x] Reminder deduplication exists (`ReminderLog` with
      `@@unique([appointmentId, whenKey])`) — working as designed.
- [x] Extend `GET /customers/:id/appointments` to join `Invoice` data,
      rather than building a separate new endpoint — keep one source of
      truth for "everything about this client." **Verify this extension
      was actually done, not just the underlying Invoice model.**
- [x] Loyalty points: `LoyaltyAccount` (customerId, businessId,
      pointsBalance) + `LoyaltyTransaction` (accountId, invoiceId?,
      points, type) — built. Confirm points only accrue on invoices with
      `status: paid`, never on `draft` or `sent`.
- [x] Staff commission calculation: built at the `ServiceStaff` level
      (`commissionType`: `NONE`/`FLAT`/`PERCENT`, `commissionAmount`),
      with the resulting earned amount snapshotted onto
      `InvoiceLineItem.commissionEarnedCents` at invoice time. This is a
      better design than originally sketched here — snapshotting at
      invoice time means a later change to a staff member's commission
      rate doesn't retroactively alter historical invoices or commission
      reports. Keep this pattern for any future commission-adjacent
      feature.

(Analytics dashboard moved to its own dedicated Phase 3 — see below.
The data this phase produces — paid invoices, commissions, no-show
counts — is what Phase 3's reporting reads from, so this phase should
still land first.)

### Appointment lifecycle

Appointment status progression:

pending
→ confirmed
→ completed

Alternative terminal states:

pending
→ cancelled_by_customer

pending
→ cancelled_by_business

confirmed
→ no_show

Appointments are created as `pending` by default.

Business staff are responsible for confirming appointments.

Invoices remain independent from appointment status and may exist
without an appointment relation.

### Phase 3 — Owner analytics dashboard (IN PROGRESS)

### Analytics architecture

Analytics should be implemented through a dedicated
`AnalyticsService`.

Prefer extending existing business statistics endpoints rather than
creating a new endpoint per chart.

A dashboard requesting ten metrics should ideally trigger one service
aggregation workflow rather than ten independent API calls.

Generic analytics belong in shared Layer 2 modules.

Vertical-specific analytics belong in their respective plug-ins and
must not be merged into shared reporting services.

This phase exists because a business owner needs visibility into their
own business, not just the tools to run it day to day. Everything here
is read-only reporting — no new core tables beyond what's listed, just
aggregation queries over `Invoice`, `Appointment`, `Customer`, and
`Staff`. This phase is shared across all verticals (Layer 2) — none of
it is salon- or clinic-specific, so it lands before the Phase 4 plug-in
mechanism and before any vertical plug-in work. Check what
`GET /businesses/:id/stats` currently returns before assuming any of
this needs to be built from scratch — extend the existing endpoint
rather than fragmenting reporting across many new routes where one
endpoint family will do.

**Generic vs. vertical-specific split — read this before building
any report.** Roughly 70% of analytics (revenue trend, new vs.
returning customers, no-show rate, staff utilization, commission
earned) reads from `Invoice`/`Appointment`/`Customer`/`Staff` without
caring what the service was — build this as a single shared
`AnalyticsService` with zero vertical branching. About 20% (e.g.
"revenue by category") is structurally generic but needs a
vertical-aware _grouping key_ — the query is identical, but a salon's
categories ("Hair"/"Nails"/"Skin") differ from a clinic's
("Consultation"/"Procedure"/"Follow-up"). This requires adding
`Service.category` as a nullable plain string (same pattern as
`Business.vertical` — no enum, since the vocabulary differs per
vertical and shouldn't need a migration to extend). The remaining
~10% is genuinely vertical-specific (insurance claim approval rate,
package redemption rate) and depends on tables that don't exist until
Phase 5/6 — leave room for these as separate query modules called
alongside the generic dashboard, never merged into it, following the
same plug-in discipline as the rest of the schema.

**Money analytics**

- [ ] Revenue trend over time (daily/weekly/monthly), computed from
      `Invoice` where `status: paid`, grouped by `paidAt`. Sum
      `totalCents`, divide by 100 only at display time.
- [ ] Revenue by service category — requires adding `Service.category`
      (see split note above) before this is buildable; currently absent
      from the schema.
- [ ] Revenue by day of week (averaged) — useful for salons
      specifically, which see strong weekend/weekday swings in Egypt.
- [ ] Average invoice value (`totalCents`), and its trend over time.
- [ ] Outstanding/unpaid invoice count and total — invoices sitting in
      `status: sent` for longer than a defined window (e.g. same-day cash
      collection rate, since this product is cash-only and "outstanding"
      here means "not yet marked paid today," not a due-date concept).

**Customer analytics**

- [ ] New vs. returning customers per period — "new" defined as
      `Customer.createdAt` falling inside the period; "returning" as an
      existing customer with an `Appointment` in the period.
- [ ] Customer lifetime value — sum of `Invoice.totalCents` where
      `status: paid`, grouped by `customerId`.
- [ ] At-risk / lapsed customer list — customers whose `lastVisitAt`
      exceeds a configurable threshold (suggest 45 days as a starting
      default; this directly powers a future lapsed-client WhatsApp
      reactivation flow once that's built, but the list itself is useful
      to a human receptionist regardless).
- [ ] No-show and cancellation rate over time, from
      `Appointment.status` and `Customer.noShowCount`.
- [ ] Top customers by lifetime spend — a simple ranked query, no new
      table needed.
- [ ] **Customer acquisition source — requires a new field.** Add
      `Customer.acquisitionSource` (nullable string).

      Recommended values:

      - walk_in
      - instagram
      - facebook
      - google
      - referral
      - booking_page
      - other

      Store as a string rather than an enum to avoid schema
      migrations when acquisition channels change.

      This cannot be backfilled retroactively for existing customers
      once they exist without this field, so add it in this phase even
      though the reporting that uses it is read-only — the cost of
      waiting is permanent data loss for every customer created before
      the field exists.

**Staff analytics**

- [ ] Revenue generated per staff member — sum of `Invoice.totalCents`
      for invoices tied to that staff member's appointments (via
      `InvoiceLineItem.staffId`).
- [ ] Utilization rate per staff member — booked hours (from
      `Appointment` durations) against available hours (from
      `Availability` minus `AvailabilityOverride` day-off entries).
- [ ] Commission earned per staff member per period — sum
      `InvoiceLineItem.commissionEarnedCents` for that staff member within
      a date range; this phase is purely the reporting view on top of the
      Phase 2 commission snapshot, not a new calculation.

**Operations analytics**

- [ ] Booking heatmap by hour and day of week — appointment volume
      grouped by `startsAt` hour, to help an owner see peak demand windows
      for staffing decisions.
- [ ] Most-booked services — count of `Appointment` grouped by
      `serviceId`.
- [ ] Booking lead time distribution — difference between
      `Appointment.createdAt` and `Appointment.startsAt`, bucketed (same
      day / 1-2 days / 3-7 days / 1 week+).
- [ ] Service duration accuracy — compares scheduled `Service.durationMin`
      against actual elapsed time if/when actual start and end timestamps
      are captured at checkout; if this data doesn't exist yet, this item
      is a placeholder for once Phase 1 checkout flow is live and stable,
      not something to build prematurely.

**Growth analytics**

- [ ] Month-over-month revenue growth — derived from the money
      analytics above, not a new query.
- [ ] Customer acquisition by source — reads `Customer.acquisitionSource`
      from above, grouped and counted.
- [ ] Package/bundle uptake trend — depends on the Phase 5 `Package`
      model existing, so this specific item is blocked until that phase
      lands; sequence it last within Phase 3's growth section, or revisit
      once Phase 5 is done.

---

### Phase 4 — Plug-in mechanism (NOT STARTED)

- [ ] `VerticalConfig` (or a static config object if verticals change
      rarely) mapping `Business.vertical` string values to which optional
      modules/routes are enabled. This is the actual mechanism for
      "support multiple business types without rewriting the app."
      `Business.vertical` is intentionally a plain string, not a Prisma
      enum — strings don't require a migration to add a new value.
      **Scheduling itself (`Service`, `Appointment`, `Availability` —
      see Layer 1.5 in section 2) is one of the modules this config
      controls.** Salons and clinics enable it; a future retail vertical
      would not. Design the config with this in mind from the start
      rather than assuming every business has appointments.
- [ ] Enforce in code review (human or agent) that no vertical-specific
      field is ever added directly to a Layer 1/2 table. See section 2.

### Phase 5 — Salon plug-in (NOT STARTED)

- [ ] `AppointmentPhoto` (appointmentId, photoId, type:
      before/after) — reuses the `Photo` model from Phase 0.
- [ ] `Package` (businessId, name, sessionsIncluded, priceCents) +
      `CustomerPackage` (customerId, packageId, sessionsRemaining) —
      pre-paid bundles. Checkout needs a vertical-aware branch here: if a
      client has an active package covering the service, deduct a session
      instead of generating a full invoice. This branch belongs behind
      the Phase 4 vertical config, not hardcoded into the core checkout
      endpoint.

### Phase 6 — Clinic plug-in (NOT STARTED)

- [ ] `ClinicVisitRecord` (appointmentId, notes, diagnosis,
      prescriptionJson) — specialty-varying fields stored as JSON to
      avoid a different table per specialty.
- [ ] `InsuranceClaim` (invoiceId, insurerName, status, claimRef) —
      decoupled from how the patient paid (always cash per section 5);
      this tracks the clinic's separate claim against an insurer for
      reimbursement after the fact.
- [ ] `ClinicVisitRecordHistory` (recordId, changedFields, changedAt,
      changedBy) — **append-only, never overwritten.** This is the one
      place in the schema where standard "just update the row" is wrong;
      medical compliance requires proof a record wasn't altered after the
      fact. Implement via a Prisma middleware/extension intercepting
      updates to `ClinicVisitRecord`, not by relying on developers to
      remember to log changes manually everywhere.

---

## 8. Known issues — monitor, not yet scheduled

These were surfaced during a project review but are not blocking
current phase work. Don't fix opportunistically without a specific
task — but don't ignore them if you're already touching the related
code.

- **In-memory rate limiting** (`express-rate-limit`): fine on a single
  Railway instance, becomes a bypass vector on multi-instance
  deployment. Move to Redis-backed (`rate-limit-redis`) before any
  horizontal scaling decision.
- **`Availability.startTime`/`endTime` use `DateTime`** for what is
  logically time-of-day recurring data, not a specific calendar date.
  Works today but adds query complexity that will compound as
  vertical plug-ins also need time-of-day comparisons.
- **No email provider integration confirmed working** — emails are
  queued via BullMQ but actual SMTP sending via Brevo may not be
  fully wired up. Verify before Phase 1 needs to email a receipt.
- **No input sanitization on rich text** (`Customer.notes`,
  `Faq.answer`, `WebsiteContent.aboutText`) — these render on the
  public website. If rendered as raw HTML rather than escaped text,
  this is an XSS vector on a customer-facing page.
- **Possible Booking → Appointment transaction gap** — review whether
  customer creation and appointment linkage happen in a single
  transaction during public booking; a split could theoretically
  produce an orphaned customer with no linked appointment.
- **No file cleanup on logo/cover replacement** — old Cloudinary
  files aren't deleted when replaced, leading to storage cost
  creep over time. Low priority.

---

## 9. Conventions

- **Layering:** strict Route → Controller → Service → Model
  (Prisma). Controllers do not contain business logic — that
  belongs in services. Do not skip layers, even for "simple" CRUD.
- **Naming:** TypeScript code in camelCase. Database columns in
  snake_case via Prisma `@map()` on every field. Database tables in
  snake_case plural via `@@map()`. IDs are UUIDs everywhere
  (`@default(uuid()) @db.Uuid`).
- **Money:** stored as `Int` in cents (e.g. `totalCents`,
  `unitPriceCents`, `subtotalCents`), never `Float` and never
  `Decimal`. Working in integer cents avoids floating-point rounding
  errors without needing Prisma's `Decimal` type. `Invoice.currency`
  defaults to `"EGP"` as a string field rather than being hardcoded,
  even though this product is Egypt-only today — this costs nothing
  now and avoids a schema change if that ever needs to be visible
  per-invoice later. When displaying money, divide by 100 and format
  with the currency — do not display raw cents to a user.
- **No due dates, no overdue status.** Cash-on-delivery means a
  client pays in full at the moment of service — there is no concept
  of an invoice being "overdue" because nothing is owed after the
  transaction completes. `InvoiceStatus` should only have
  `draft`/`sent`/`paid`/`voided`. If you see `dueAt` or `overdue`
  anywhere, treat it as leftover scope creep to remove, not a feature
  to implement.
- **Background jobs:** BullMQ for anything that shouldn't block a
  request — ETA e-receipt submission is the canonical example.
  Jobs call through services, not directly through Prisma, if a
  service method already exists for that operation.
- **Migrations:** every schema change needs a one-line reason in the
  migration message (e.g. "add Invoice model — financial core for
  checkout flow"), not a generic "schema update."
- **Before any schema change:** check section 7 above to confirm the
  work is actually next in sequence and not blocked by an earlier,
  unfinished phase.

---

## 10. Decisions log — do not silently reverse these

Recorded so a future session (human or agent) doesn't re-propose
something already explicitly rejected.

- **2026-06 — Cash-only payments, with an explicit future trigger.**
  No payment gateway between client and business. No Fawry, no
  Vodafone Cash, no Visa/card processing, no due-date or overdue
  invoice logic for Relationship B (section 5) — the entire product
  currently models payment as a single in-person cash transaction.
  **This will change**, but only once a meaningful number of paying
  Hgezli customers explicitly ask for card/Visa support — not
  speculatively. When that happens, treat it as a significant
  architecture decision requiring explicit sign-off (likely:
  reintroducing a `Payment` table decoupled from `Invoice.status`,
  since "paid" can no longer be a single boolean-like state once a
  gateway with pending/failed/refunded states is involved). Until
  then, any schema field implying otherwise — `dueAt`, `overdue`, a
  `Payment` table, gateway IDs on `Invoice` — should be treated as
  scope creep to remove, not a feature to build toward.
- **2026-06 — WhatsApp Business API deferred, and deliberately not
  phase-scheduled.** Originally planned as "build once profitable,"
  refined further: full API integration is now treated as a future
  big-feature initiative planned in its own dedicated pass once real
  pilot usage data exists, rather than a numbered phase in the
  current plan. `wa.me` manual links remain the only mechanism until
  then (section 5). Reasoning: early API integration risks locking in
  message templates before there's evidence of what businesses
  actually need to send, and Meta's template approval process adds
  friction that isn't worth paying before that evidence exists.
- **2026-06 — Egypt-only market.** Multi-country / multi-currency
  support is explicitly out of scope, not a gap to fill.
- **2026-06 — Bilingual (English + Arabic) from the start, not
  Arabic-only.** Despite `Business.language` defaulting to `"ar"` in
  the schema, the target customer base (salon and clinic owners and
  clients in Egypt) skews educated and often English-comfortable.
  Both the public website and admin dashboard need genuine English
  and Arabic support, including real RTL layout for Arabic, not just
  translated strings. See section 4 for full detail. Do not treat
  English as a lower-priority "nice to have" language.
- **Booking flow — appointments start `pending`, confirmed manually
  by the business owner.** Not auto-confirmed on creation.
- **Auth — email confirmation, not OTP.** If OTP-based auth comes up
  as a suggestion, it's a reversal of an existing decision, not a
  neutral option.

- **2026-06 — Single staff ownership per appointment.**
  An appointment currently belongs to exactly one staff member.

  Multi-staff appointments (e.g. stylist + assistant,
  doctor + technician) are intentionally out of scope.

  If required later, implement through a join table rather than
  adding multiple staff columns to `Appointment`.

---

## 11. How to use this file as an agent

1. Read this entire file before starting any task in this repo.
2. Check section 7 to find the current phase and the specific
   unchecked item you're working on.
3. Check section 10 before suggesting anything that sounds like a
   payment gateway, WhatsApp automation, or multi-country support —
   these are deliberate exclusions, not oversights.
4. Check section 2's rule before adding any new field to an existing
   model — confirm it's not vertical-specific creeping into a shared
   table.
5. Update the checkboxes in section 7 as you complete work, so the
   next session (yours or another agent's) trusts this file over
   having to re-derive status from the codebase from scratch.
6. If you find a contradiction between this file and the actual code,
   say so explicitly rather than picking one silently — this file
   should be corrected to match reality, but a human should confirm
   which one is actually correct first.
