# Scheduling and Appointments

## Core concept

An `Appointment` is a reservation container. It can contain multiple `AppointmentService` segments.

Each segment has:

- `serviceId`
- `staffId`
- `startsAt`
- `endsAt`
- `durationMinSnapshot`
- `priceEgpSnapshot`
- `order`

Do not assume one appointment equals one staff member or one service.

## Multi-staff example

A single appointment may be:

- Segment 1: haircut with Ahmed from 10:00 to 11:00
- Segment 2: nails with Mona from 11:00 to 11:30

The frontend calendar should render each segment on the assigned staff row while opening the same parent appointment when clicked.

## Status enum

Prisma `AppointmentStatus`:

- `pending`
- `confirmed`
- `cancelled_by_customer`
- `cancelled_by_business`
- `no_show`
- `completed`

## Editability

The backend helper defines locked appointments as:

- status is `completed`, or
- linked invoice status is `paid`

Rules:

- Paid/completed appointments should not be edited through normal update.
- Cancelled appointments should not be edited through normal update.
- Revert and uncancel are separate state transitions.

## Main appointment routes

All are under `/api/appointments` and require auth.

- `GET /` — list appointments
- `POST /` — create manual appointment; requires `BusinessAdmin` or `Receptionist`
- `GET /:appointmentId`
- `PATCH /:appointmentId` — update segments/custom items/discount/notes
- `PATCH /:appointmentId/reschedule`
- `PATCH /:appointmentId/status`
- `PATCH /:appointmentId/notes`
- `POST /:appointmentId/finish`
- `POST /:appointmentId/cancel`
- `POST /:appointmentId/revert`
- `POST /:appointmentId/uncancel`
- `POST /:appointmentId/mark-no-show`

## Update appointment payload

`PATCH /appointments/:appointmentId` expects:

```ts
{
  segments: Array<{
    id?: string;        // existing segment id; omit for new segment
    serviceId: string;
    staffId: string;
    startsAt: string;   // ISO datetime
    endsAt: string;     // ISO datetime
  }>;
  customItems: Array<{
    id?: string;
    description: string;
    priceCents: number;
  }>;
  discountCents: number;
  notes?: string;
}
```

The service:

- checks appointment ownership by `businessId`
- asserts editability
- checks staff conflicts for every segment
- deletes removed segments
- updates existing segments
- creates new segments
- replaces custom items
- updates parent appointment start/end based on sorted segments

## Staff conflict logic

Use `assertStaffAvailable` for backend checks.

It checks overlapping `AppointmentService` rows for the same staff, excluding cancelled appointments and excluding the appointment being edited.

Overlap rule:

```txt
existing.startsAt < newEndsAt AND existing.endsAt > newStartsAt
```

## Public booking flow

Booking routes are under `/api/bookings`.

- `GET /availability`
- `POST /`
- `GET /confirm/:token`
- `POST /cancel/:token`

The frontend sends selected services as an ordered array. If `staffId` is omitted for a service, the backend auto-assigns any capable and available staff.

## Scheduling service

`scheduleServiceSegments` walks ordered services sequentially from the requested start time.

For each service:

1. Load service duration and price.
2. Determine candidate staff.
3. Check appointment segment conflicts.
4. Pick the first available candidate.
5. Advance the start time to the previous segment end.

This shared scheduling behavior is used for public bookings and manual appointments.

## Timezones

Businesses store timezone. Default is `Africa/Cairo`.

For date-only listing, use business-day UTC boundaries through `getBusinessDayRange`. Avoid direct `new Date(date)` for date-only business filters.

## Staff breaks

Prisma has `StaffBreak` with:

- `staffId`
- `businessId`
- `breakDate`
- `startTime`
- `endTime`
- `label`

Frontend calendar types already include `StaffBreak`, but adapter currently leaves `breaks: []`. Wire backend and frontend together before rendering real breaks.

## Known risk areas

- Manual appointment creation increments customer visit count immediately.
- Cancel/uncancel also modifies customer visit counts.
- No-show modifies `noShowCount`.
- Revert can decrement no-show count if the appointment was no-show.
- Paid invoice handling must remain transactionally safe.
