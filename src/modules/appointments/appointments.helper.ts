import { AppointmentStatus, InvoiceStatus, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { lockStaffSchedulingDay } from "../../shared/services/scheduling/scheduling-lock.service";
import {
  computeStaffFreeIntervals,
  isStaffFreeFor,
} from "../../shared/services/scheduling/staff-free-intervals.service";

type TxClient = Prisma.TransactionClient;
type AppointmentError = Error & { statusCode: number; code: string };

const CANCELLED_STATUSES = [
  AppointmentStatus.cancelled_by_business,
  AppointmentStatus.cancelled_by_customer,
] as const;

function appointmentError(
  message: string,
  statusCode: number,
  code: string,
): AppointmentError {
  const error = new Error(message) as AppointmentError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function notFoundError(message = "Appointment not found") {
  return appointmentError(message, 404, "NOT_FOUND");
}

export function invalidStateError(
  message: string,
  code = "INVALID_STATE",
  statusCode = 400,
) {
  return appointmentError(message, statusCode, code);
}

export function isCancelled(status: AppointmentStatus): boolean {
  return (CANCELLED_STATUSES as readonly AppointmentStatus[]).includes(status);
}

export function isLocked(appointment: {
  status: AppointmentStatus;
  invoice?: { status: InvoiceStatus } | null;
  invoices?: Array<{ status: InvoiceStatus }>;
}): boolean {
  return (
    appointment.status === AppointmentStatus.completed ||
    appointment.invoice?.status === InvoiceStatus.paid ||
    appointment.invoices?.some(
      (invoice) => invoice.status === InvoiceStatus.paid,
    ) === true
  );
}

export async function getOwnedAppointmentOrThrow<
  T extends Prisma.AppointmentInclude,
>(tx: TxClient, id: string, businessId: string, include?: T) {
  const appointment = await tx.appointment.findFirst({
    where: { id, businessId },
    include: include ?? ({ customer: true } as T),
  });
  if (!appointment) throw notFoundError();
  return appointment as Prisma.AppointmentGetPayload<{ include: T }>;
}

export function assertEditable(appointment: {
  status: AppointmentStatus;
  invoice?: { status: InvoiceStatus } | null;
  invoices?: Array<{ status: InvoiceStatus }>;
}) {
  if (isLocked(appointment)) {
    throw invalidStateError(
      "Cannot edit a completed or paid appointment",
      "LOCKED",
    );
  }
  if (isCancelled(appointment.status)) {
    throw invalidStateError("Cannot edit a cancelled appointment");
  }
}

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

export async function assertStaffAvailableBatch(
  tx: TxClient,
  segments: Array<{ staffId: string; startsAt: Date; endsAt: Date }>,
  excludeAppointmentId: string,
) {
  if (segments.length === 0) return;

  const conflicts = await tx.appointmentService.findMany({
    where: {
      appointmentId: { not: excludeAppointmentId },
      appointment: { status: { notIn: [...CANCELLED_STATUSES] } },
      OR: segments.map((segment) => ({
        staffId: segment.staffId,
        AND: [
          { startsAt: { lt: segment.endsAt } },
          { endsAt: { gt: segment.startsAt } },
        ],
      })),
    },
    select: { id: true },
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

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
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
  options: {
    businessId: string;
    branchId?: string | null;
    businessTimezone: string;
    excludeAppointmentId: string;
    segments: Array<{
      serviceId: string;
      staffId: string;
      startsAt: Date;
      endsAt: Date;
      checkEligibility?: boolean;
    }>;
  },
) {
  const {
    businessId,
    branchId,
    businessTimezone,
    excludeAppointmentId,
    segments,
  } = options;
  if (segments.length === 0) return;

  const segmentsRequiringEligibility = segments.filter(
    (segment) => segment.checkEligibility !== false,
  );
  const eligibilityRows = await Promise.all(
    segmentsRequiringEligibility.map((segment) =>
      tx.serviceStaff.findFirst({
        where: {
          serviceId: segment.serviceId,
          staffId: segment.staffId,
          service: {
            businessId,
            ...(branchId ? { branchId } : {}),
          },
          staff: {
            businessId,
            ...(branchId ? { branchId } : {}),
          },
        },
        include: {
          staff: { select: { isActive: true, businessId: true, branchId: true } },
          service: { select: { isActive: true, businessId: true, branchId: true } },
        },
      }),
    ),
  );

  for (let index = 0; index < eligibilityRows.length; index += 1) {
    const row = eligibilityRows[index];
    if (
      !row ||
      !row.staff.isActive ||
      !row.service.isActive ||
      row.staff.businessId !== businessId ||
      row.service.businessId !== businessId ||
      (branchId &&
        (row.staff.branchId !== branchId || row.service.branchId !== branchId))
    ) {
      const segment = segmentsRequiringEligibility[index];
      throw invalidStateError(
        `Staff ${segment.staffId} is not eligible for service ${segment.serviceId}`,
        "STAFF_INELIGIBLE",
      );
    }
  }

  const staffIds = [...new Set(segments.map((segment) => segment.staffId))];
  const date = DateTime.fromJSDate(segments[0].startsAt)
    .setZone(businessTimezone)
    .toFormat("yyyy-MM-dd");

  await lockStaffSchedulingDay(tx, { businessId, date, staffIds });

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
