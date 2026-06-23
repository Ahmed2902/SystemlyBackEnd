# CONVENTIONS.md

## Architecture

Strict four-layer backend: Route -> Controller -> Service -> Model (Prisma).
Do not skip layers. Controllers do not contain business logic — that
belongs in services.

## Naming

- Code (TypeScript): camelCase
- Database columns: snake_case via Prisma @map(), enforced on every field
- Database tables: snake_case plural via @map(), e.g. @@map("invoices")
- IDs: UUID everywhere, @default(uuid()) @db.Uuid

## Money

- All currency fields: Decimal @db.Decimal(10, 2), suffixed Egp
  (e.g. totalEgp, priceEgp). Never use Float for money.
- Payment model: CASH ONLY between client and business. Do not add
  payment gateway fields to Invoice for client-facing payments. ALL customer-facing
  payments are Cash On Delivery (COD). Do NOT call or attach payment gateway
  metadata to `Invoice` or `InvoiceLineItem` for customer charges.
  Subscription.paymobSubscriptionId is the only real gateway integration
  and it covers business-to-Hgezli billing only.
- Invoice.status lifecycle is: draft -> issued -> paid (or void).
  There is no partially_paid state — cash is collected in full at
  checkout, recorded with a single tap.

## Plug-in pattern (critical — read before adding any vertical feature)

- Business.vertical is a plain string, not an enum. This is intentional.
- Vertical-specific tables (e.g. ClinicVisitRecord, AppointmentPhoto)
  attach to Appointment or Invoice via a foreign key.
- NEVER add a vertical-specific column directly to Appointment, Invoice,
  Customer, or any other Phase 0-2 shared table. If a field only matters
  for one vertical, it belongs in a new plug-in table, not a nullable
  column on a shared one.
- Before adding any field, ask: "would a clinic AND a salon need this?"
  If yes -> shared table (Layer 1/2). If only one vertical needs it ->
  new plug-in table (Layer 3).

## Background jobs

- BullMQ for anything that should not block a request (ETA e-receipt
  submission, future notification sending).
- Jobs read/write through services, never call Prisma directly from a
  job file if a service method already exists for that operation.

## Notifications (read before touching NotificationLog)

- Default channel is whatsapp_link — a pre-filled wa.me URL the staff
  member taps to send manually. This is NOT automated. Do not build
  WhatsApp Business API integration without explicit instruction —
  it is deferred until profitable (see PHASE_STATUS.md deferred section).
- NotificationLog was renamed from SmsLog. If you see references to
  SmsLog or a sms.service.ts file, that is legacy naming being phased out.

## Migrations

- Every schema change needs a written one-line reason in the migration
  message, e.g. "add Invoice model — financial core for checkout flow"
  not just "schema update".
- Check CURRENT_TASK.md and PHASE_STATUS.md before starting any new
  schema change — confirm the task is actually next in sequence and not
  blocked by an earlier unfinished phase.
