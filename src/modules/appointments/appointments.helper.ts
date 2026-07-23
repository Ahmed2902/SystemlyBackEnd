import { Prisma, AppointmentStatus, InvoiceStatus } from "@prisma/client";
import { DateTime } from "luxon";
import {
  computeStaffFreeIntervals,
  isStaffFreeFor,
} from "../../shared/services/scheduling/staff-free-intervals.service";

type TxClient = Prisma.TransactionClient;

const CANCELLED_STATUSES = [
  AppointmentStatus.cancelled_by_business,
  AppointmentStatus.cancelled_by_customer,
] as const;

// ---- Error builders — same shape used everywhere, just named now ----

export function notFoundError(message = "Appointment not found") {
  const err: any = new Error(message);
  err.statusCode = 404;
  err.code = "NOT_FOUND";
  return err;
}

export function forbiddenError(
  message = "Appointment does not belong to this business",
) {
  const err: any = new Error(message);
  err.statusCode = 403;
  err.code = "FORBIDDEN";
  return err;
}

export function invalidStateError(
  message: string,
  code = "INVALID_STATE",
  statusCode = 400,
) {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

// ---- Status helpers ----

export function isCancelled(status: AppointmentStatus): boolean {
  return (CANCELLED_STATUSES as readonly AppointmentStatus[]).includes(status);
}

/**
 * Locked = completed, or has a paid invoice. Matches the frontend's
 * isLocked derivation exactly — keep both in sync if this changes.
 */
export function isLocked(appt: {
  status: AppointmentStatus;
  invoice?: { status: InvoiceStatus } | null;
  invoices?: Array<{ status: InvoiceStatus }>;
}): boolean {
  return (
    appt.status === AppointmentStatus.completed ||
    appt.invoice?.status === InvoiceStatus.paid ||
    appt.invoices?.some((invoice) => invoice.status === InvoiceStatus.paid) === true
  );
}

// ---- Ownership guard ----

/**
 * Fetches an appointment scoped to a business, or throws 404/403.
 * `include` defaults to just `customer` — pass a richer include when a
 * caller needs more (e.g. appointmentServices, invoice).
 */
export async function getOwnedAppointmentOrThrow<
  T extends Prisma.AppointmentInclude,
>(tx: TxClient, id: string, businessId: string, include?: T) {
  const appt = await tx.appointment.findUnique({
    where: { id },
    include: include ?? ({ customer: true } as T),
  });
  if (!appt) throw notFoundError();
  if (appt.businessId !== businessId) throw forbiddenError();
  return appt as Prisma.AppointmentGetPayload<{ include: T }>;
}

// ---- Editability guards ----

export function assertEditable(appt: {
  status: AppointmentStatus;
  invoice?: { status: InvoiceStatus } | null;
  invoices?: Array<{ status: InvoiceStatus }>;
}) {
  if (isLocked(appt)) {
    throw invalidStateError(
      "Cannot edit a completed or paid appointment",
      "LOCKED",
    );
  }
  if (isCancelled(appt.status)) {
    throw invalidStateError("Cannot edit a cancelled appointment");
  }
}

// ---- Invoice void ----

/** Voids a paid invoice tied to this appointment, if one exists. No-op otherwise. */
export async function voidInvoiceIfPaid(tx: TxClient, appointmentId: string) {
  const existingInvoice = await tx.invoice.findFirst({
    where: { appointmentId, status: { not: InvoiceStatus.voided } },
    orderBy: { issuedAt: "desc" },
  });
  if (existingInvoice) {
    await tx.invoice.updateMany({
      where: { appointmentId, status: { not: InvoiceStatus.voided } },
      data: { status: InvoiceStatus.voided, voidedAt: new Date() },
    });
  }
  return existingInvoice;
}

// ---- Staff availability / conflict check ----

/**
 * Throws SLOT_TAKEN if `staffId` has any overlapping segment on another,
 * non-cancelled appointment. Excludes the appointment being edited so its
 * own existing segments don't conflict with themselves.
 */
export async function assertStaffAvailableBatch(
  tx: TxClient,
  segments: Array<{ staffId: string; startsAt: Date; endsAt: Date }>,
  excludeAppointmentId: string,
) {
  if (segments.length === 0) return;

  const conflicts = await tx.appointmentService.findMany({
    where: {
      appointmentId: { not: excludeAppointmentId },
      appointment: { status: { notIn: CANCELLED_STATUSES as any } },
      OR: segments.map((seg) => ({
        staffId: seg.staffId,
        AND: [
          { startsAt: { lt: seg.endsAt } },
          { endsAt: { gt: seg.startsAt } },
        ],
      })),
    },
    select: { id: true, staffId: true, startsAt: true, endsAt: true },
  });

  if (conflicts.length > 0) {
    throw invalidStateError(
      "Staff is double-booked for this time",
      "SLOT_TAKEN",
      409,
    );
  }
}

export function assertSegmentsDoNotOverlap(
  segments: Array<{ startsAt: Date; endsAt: Date }>,
) {
  const ordered = segments
    .slice()
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (current.startsAt < previous.endsAt) {
      throw invalidStateError(
        "Appointment services cannot overlap",
        "INVALID_SEGMENT_RANGE",
      );
    }
  }
}

export async function assertSegmentsAssignable(
  tx: TxClient,
  opts: {
    businessId: string;
    businessTimezone: string;
    excludeAppointmentId: string;
    segments: Array<{
      serviceId: string;
      staffId: string;
      startsAt: Date;
      endsAt: Date;
    }>;
  },
) {
  const { businessId, businessTimezone, excludeAppointmentId, segments } = opts;
  if (segments.length === 0) return;

  const eligibilityRows = await Promise.all(
    segments.map((segment) =>
      tx.serviceStaff.findFirst({
        where: {
          serviceId: segment.serviceId,
          staffId: segment.staffId,
          service: { businessId },
          staff: { businessId },
        },
        include: {
          staff: { select: { isActive: true, businessId: true } },
          service: { select: { isActive: true, businessId: true } },
        },
      }),
    ),
  );

  for (const row of eligibilityRows) {
    if (
      !row ||
      !row.staff.isActive ||
      !row.service.isActive ||
      row.staff.businessId !== businessId ||
      row.service.businessId !== businessId
    ) {
      throw invalidStateError(
        "Staff is not eligible for this service",
        "STAFF_INELIGIBLE",
      );
    }
  }

  const staffIds = [...new Set(segments.map((segment) => segment.staffId))];
  const date = DateTime.fromJSDate(segments[0].startsAt)
    .setZone(businessTimezone)
    .toFormat("yyyy-MM-dd");
  const freeByStaff = await computeStaffFreeIntervals(
    staffIds,
    businessId,
    date,
    businessTimezone,
    excludeAppointmentId,
    tx,
  );

  for (const segment of segments) {
    const segmentStart = DateTime.fromJSDate(segment.startsAt).setZone(
      businessTimezone,
    );
    const segmentEnd = DateTime.fromJSDate(segment.endsAt).setZone(
      businessTimezone,
    );
    const freeIntervals = freeByStaff.get(segment.staffId) ?? [];
    if (!isStaffFreeFor(freeIntervals, segmentStart, segmentEnd)) {
      throw invalidStateError(
        "Staff is not available for this time",
        "SLOT_TAKEN",
        409,
      );
    }
  }
}
