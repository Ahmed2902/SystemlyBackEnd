import { Prisma, AppointmentStatus, InvoiceStatus } from "@prisma/client";

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
}): boolean {
  return (
    appt.status === AppointmentStatus.completed ||
    appt.invoice?.status === InvoiceStatus.paid
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
  const existingInvoice = await tx.invoice.findUnique({
    where: { appointmentId },
  });
  if (existingInvoice && existingInvoice.status !== InvoiceStatus.voided) {
    await tx.invoice.update({
      where: { appointmentId },
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
