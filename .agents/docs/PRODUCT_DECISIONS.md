# Product Decisions and Intent

This file captures decisions that may not be fully obvious from code.

## Roles and access

Roles include:

- `SuperAdmin`
- `BusinessAdmin`
- `Staff`
- `Receptionist`
- `User`

Product intent:

- `BusinessAdmin` owns business management and analytics.
- `Receptionist` and `Staff` can operate appointments for now, but should not see revenue dashboards unless explicitly allowed.
- `SuperAdmin` can bypass normal business scoping.

## Operations pages wanted

The operations system should eventually include:

1. Owner dashboard with analytics and revenue.
2. Calendar page showing reservations with customer, staff, service, and status.
3. Appointment detail/edit page or side panel with notes, history, photos, clinical records where applicable.
4. Manual appointment creation page.
5. Appointment status/workflow page or status controls.
6. Customers page with visit history and notes.
7. Services/staff setup pages.
8. Billing/subscription owner page.

## Calendar direction

Use staff rows and horizontal time columns.

Why:

- Works better when there are many staff members.
- Makes double-booking visible per staff member.
- Supports multi-staff appointments by rendering appointment service segments on each relevant staff row.

The calendar should not assume one staff member per appointment. The appointment itself can be a container; each service segment has its own staff and time range.

## Appointment lifecycle intent

Expected statuses:

- `pending`
- `confirmed`
- `cancelled_by_customer`
- `cancelled_by_business`
- `no_show`
- `completed`

State notes:

- Confirmed appointments are editable.
- Completed or paid appointments are locked.
- Revert should reopen completed/paid/no-show appointments when business logic permits, and void invoice if needed.
- Cancel should not be the same as revert.
- Uncancel should only be available for cancelled appointments.
- Mark no-show should only apply to confirmed appointments.

## Payment and invoice intent

- Client/business customer payments are cash-first for V1.
- `collect-payment` should create or update an invoice as paid and lock the appointment.
- Reverting a paid appointment should void the existing invoice so the appointment can be edited and recollected later.
- Hgezli subscription billing is separate from client appointment invoices.

## Vertical intent

Clinic:

- Supports clinical visit records.
- May support diagnosis/prescription fields.
- Appointment history matters.

Salon:

- Supports appointment photos and service/staff workflows.
- Should not expose clinical fields.
