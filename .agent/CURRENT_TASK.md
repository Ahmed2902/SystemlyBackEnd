# CURRENT_TASK.md

## Active phase: 1 — Cash checkout flow

Status: COMPLETE

All Phase 1 endpoints and jobs have been implemented.

### Completed items

- [x] POST /invoices/checkout — creates Invoice + InvoiceLineItem atomically from an appointment
- [x] PATCH /invoices/:id/mark-paid — sets status=paid + paidAt, triggers ETA receipt job
- [x] ETA e-receipt background job — simulated submission, registers etaReceiptUid on Invoice
- [x] GET /invoices/:id/receipt — generates on-demand PDF receipt via pdfkit

### Files created

- `src/modules/invoices/` — invoices.schema.ts, invoices.service.ts, invoices.controller.ts, invoices.routes.ts
- `src/queues/etaQueue.ts` — BullMQ queue for ETA receipt submissions
- `src/jobs/etaReceipt.job.ts` — simulated ETA receipt submission job

### Files modified

- `src/routes/index.ts` — registered invoices routes at /invoices
- `src/jobs/index.ts` — registered ETA receipt job
- `prisma/schema.prisma` — added etaReceiptUid and etaSubmittedAt to Invoice model
- `src/modules/invoices/invoices.service.ts` — wired ETA trigger into markPaid

## Next: Phase 2 — Shared appointment modules

Status: PARTIALLY STARTED
