# Hgezli Project Context

## Product

Hgezli is a multi-tenant SaaS platform for appointment-based businesses in Egypt. The current focus is clinics and salons, but the architecture should support vertical-specific behavior.

The product has two major surfaces:

1. A public business website and booking flow for customers.
2. An internal operations system for business owners, receptionists, and staff.

## Target businesses

Primary verticals:

- `salon`: beauty salons, barbers, spas, nail salons, and similar appointment businesses.
- `clinic`: medical clinics, dentists, dermatology, physiotherapy, and similar medical appointment businesses.

The backend has vertical module flags. Clinics can enable clinical records; salons generally should not show medical fields.

## Repos

- Backend: `Website-Maker`
  - API name/package: `hgezli-backend`
  - Node.js + Express + TypeScript
  - PostgreSQL through Prisma
  - Background jobs through queues/workers

- Frontend: `BusinessOs-frontend`
  - App name/package: `hgezli-frontend`
  - Next.js App Router + React + TypeScript
  - Tailwind CSS
  - Operations calendar, onboarding, marketing, public website, booking flow

## Business rules from product discussions

- Analytics/dashboard pages should be owner-only. Receptionist and staff should not see revenue or analytics.
- Staff and receptionist can be treated similarly for now because dedicated staff accounts are not fully finalized.
- Operations UI should support many staff members without becoming messy.
- Calendar design should remain calendar-like, but use staff rows and time columns to handle many staff.
- A single appointment can contain multiple service segments assigned to different staff members.
- Example: Ahmed handles haircut 10:00-11:00, Mona handles nails 11:00-11:30, under the same customer appointment.
- Public customer payment is not the current focus. Client pays the business directly, usually cash for V1.
- Business subscription payments to Hgezli are separate and use Paymob/billing.
- WhatsApp should often be a prefilled `wa.me` link rather than fully automated messaging in early versions.
- Reminders are planned: if email exists, send morning-of and 2-hours-before appointment reminders.

## Agent behavior

When changing code:

- Preserve tenant isolation through `businessId`.
- Do not expose owner-only analytics to staff/receptionist.
- Keep backend and frontend contracts in sync.
- Avoid broad rewrites. Make focused, minimal patches.
- Prefer clear, boring code over clever abstractions.
- Treat scheduling and invoice state as high-risk areas.
- When unsure, inspect actual schemas/routes/components before editing.
