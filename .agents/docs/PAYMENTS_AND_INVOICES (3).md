# Payments and Invoices

## Two different payment domains

Do not confuse:

1. Business subscription payments to Hgezli.
2. Client appointment payments to the business.

For V1, appointment payment is cash-first. The operations UI uses `collect-payment` to mark the appointment's invoice as paid.

## Invoice statuses

Prisma `InvoiceStatus`:

- `draft`
- `sent`
- `paid`
- `voided`

## Invoice model notes

Important fields:

- `businessId`
- `appointmentId`
- `customerId`
- `invoiceNumber`
- `status`
- `subtotalCents`
- `discountCents`
- `taxCents`
- `totalCents`
- `currency` default `EGP`
- `issuedAt`
- `paidAt`
- `voidedAt`
- `etaReceiptUid`
- `etaSubmittedAt`

Constraints:

- Unique invoice number per business.
- Unique invoice per appointment.

## Invoice line items

Invoice line items can come from:

- appointment service segments
- appointment custom items

Service line items should keep service/staff references where possible because staff commission and analytics depend on them.

## Main invoice routes

Under `/api/invoices`:

- `POST /checkout` — create invoice from appointment
- `PATCH /:id/mark-paid` — mark invoice paid
- `POST /:id/refund` — void/refund paid invoice
- `GET /:id` — get invoice details
- `GET /:id/receipt` — PDF receipt
- `POST /collect-payment` — cash collection flow used by operations UI

## Checkout

`checkout(appointmentId, businessId)`:

- returns existing invoice if one exists and belongs to business
- requires appointment to be `confirmed` or `completed`
- requires appointment to have services
- creates line items from appointment services
- snapshots commission configuration from `ServiceStaff`
- creates invoice with status `sent`

## Mark paid

`markPaid(invoiceId, businessId)`:

- updates invoice status to `paid`
- sets `paidAt`
- enqueues ETA job
- credits loyalty points
- returns existing invoice if it is already paid

## Collect payment

`collectPayment(appointmentId, businessId, discountCents)`:

- loads appointment with services, custom items, and customer
- rejects cancelled appointments
- requires services
- builds line items from services and custom items
- calculates subtotal and total after discount
- upserts invoice by appointmentId
- sets invoice status `paid`

Important implementation note:

- The current collect-payment service returns the invoice, not the full appointment. If the frontend expects an `AppointmentSummary`, it should reload calendar after collection or backend should return a fresh appointment include.

## Revert and voiding

`voidInvoiceIfPaid` currently voids any non-voided invoice tied to an appointment. Revert calls this helper.

Product intent:

- Reverting a paid appointment should void the paid invoice and reopen appointment for editing.
- After editing, payment can be collected again and a new/upserted paid invoice should reflect the updated line items.

## Refund

Refund currently updates paid invoice to `voided` with `voidedAt` and returns refund metadata.

Do not call it for unpaid invoices.

## Commission

Commission configuration lives on `ServiceStaff`:

- `commissionType`: `NONE`, `FLAT`, `PERCENT`
- `commissionAmount`

Invoice line items snapshot commission config and final `commissionEarnedCents`. Preserve that when touching checkout and analytics.
