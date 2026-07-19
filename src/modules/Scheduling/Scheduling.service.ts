import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { toUtcFromBusinessTime } from "../../shared/utils/timezone";
import { generateCancelToken } from "../../shared/utils/token.util";
import {
  computeStaffFreeIntervals,
  isStaffFreeFor,
} from "../bookings/bookings.availabilty.utils";
type TxClient = Prisma.TransactionClient;

export interface ServiceSelection {
  serviceId: string;
  staffId?: string;
}

export interface ScheduledSegment {
  serviceId: string;
  staffId: string;
  start: Date;
  end: Date;
  durationMin: number;
  priceEgp: any;
}

export interface CreateAppointmentCoreParams {
  businessId: string;
  selections: ServiceSelection[];
  startsAt: string;
  timezone?: string;
  customerName: string;
  customerPhone: string;
  notes?: string;
  acquisitionSource?: string;
  status: "pending" | "confirmed";
  generateToken: boolean;
}

interface UpsertCustomerParams {
  businessId: string;
  phone: string;
  name?: string;
  acquisitionSource?: string;
}

/**
 * Given an ordered list of service selections and a start time, walks
 * through each service sequentially, finding an eligible + available staff
 * member for that exact segment. Throws SLOT_TAKEN if any segment can't be
 * covered. Used by both the public booking flow and staff-created manual
 * appointments so scheduling behavior stays identical between them.
 */
export async function scheduleServiceSegments(
  tx: TxClient,
  selections: ServiceSelection[],
  startsAt: string,
  tz: string,
  businessId: string, // NEW — needed to scope the availability query
): Promise<ScheduledSegment[]> {
  const serviceIds = selections.map((s) => s.serviceId);
  const services = await tx.service.findMany({
    where: { id: { in: serviceIds } },
  });
  if (services.length !== serviceIds.length) {
    const err: any = new Error("One or more services not found");
    err.statusCode = 404;
    throw err;
  }
  const serviceById = new Map(services.map((s) => [s.id, s]));

  let segmentStart = /(?:Z|[+-]\d\d:\d\d)$/.test(startsAt)
    ? DateTime.fromJSDate(new Date(startsAt)).setZone(tz)
    : DateTime.fromJSDate(toUtcFromBusinessTime(startsAt, tz)).setZone(tz);

  // Gather every staff candidate across all selections up front, then compute
  // free intervals ONCE for the whole day — same approach as the slot search,
  // now reused on the write path instead of a separate, weaker check.
  const allCandidateStaffIds = new Set<string>();
  const candidatesBySelection: string[][] = [];

  for (const sel of selections) {
    const ids = sel.staffId
      ? [sel.staffId]
      : (
          await tx.serviceStaff.findMany({
            where: { serviceId: sel.serviceId },
          })
        ).map((r) => r.staffId);
    candidatesBySelection.push(ids);
    ids.forEach((id) => allCandidateStaffIds.add(id));
  }

  const date = segmentStart.toFormat("yyyy-MM-dd");
  const freeByStaff = await computeStaffFreeIntervals(
    [...allCandidateStaffIds],
    businessId,
    date,
    tz,
  );

  const segments: ScheduledSegment[] = [];

  for (let i = 0; i < selections.length; i++) {
    const sel = selections[i];
    const svc = serviceById.get(sel.serviceId)!;
    const segEnd = segmentStart.plus({ minutes: svc.durationMin });
    const candidateStaffIds = candidatesBySelection[i];

    const assignedStaff = candidateStaffIds.find((sId) =>
      isStaffFreeFor(freeByStaff.get(sId) ?? [], segmentStart, segEnd),
    );

    if (!assignedStaff) {
      const err: any = new Error(
        "This time slot is no longer available for one of the selected services.",
      );
      err.statusCode = 409;
      err.code = "SLOT_TAKEN";
      throw err;
    }

    segments.push({
      serviceId: sel.serviceId,
      staffId: assignedStaff,
      start: segmentStart.toJSDate(),
      end: segEnd.toJSDate(),
      durationMin: svc.durationMin,
      priceEgp: svc.priceEgp,
    });

    segmentStart = segEnd;
  }

  return segments;
}

export async function createAppointmentCore(
  tx: TxClient,
  business: { id: string; timezone?: string | null },
  params: CreateAppointmentCoreParams,
) {
  const tz = params.timezone || business.timezone || "UTC";

  const segments = await scheduleServiceSegments(
    tx,
    params.selections,
    params.startsAt,
    tz,
    business.id,
  );

  const customer = await upsertCustomer(tx, {
    businessId: params.businessId,
    phone: params.customerPhone,
    name: params.customerName,
    acquisitionSource: params.acquisitionSource,
  });

  const appt = await tx.appointment.create({
    data: {
      businessId: params.businessId,
      staffId: segments[0].staffId,
      customerId: customer.id,
      startsAt: segments[0].start,
      endsAt: segments[segments.length - 1].end,
      status: params.status,
      cancelToken: params.generateToken ? generateCancelToken() : undefined,
      notes: params.notes || null,
    },
  });

  await tx.appointmentService.createMany({
    data: segments.map((s, i) => ({
      appointmentId: appt.id,
      serviceId: s.serviceId,
      staffId: s.staffId,
      order: i,
      startsAt: s.start,
      endsAt: s.end,
      durationMinSnapshot: s.durationMin,
      priceEgpSnapshot: s.priceEgp,
    })),
  });

  return { appointment: appt, customer };
}

export async function upsertCustomer(
  tx: TxClient,
  params: UpsertCustomerParams,
) {
  const { businessId, phone, name, acquisitionSource } = params;

  const existing = await tx.customer.findUnique({
    where: {
      businessId_phone: { businessId, phone } as any,
    } as any,
  });

  if (existing) {
    return tx.customer.update({
      where: { id: existing.id },
      data: {
        visitCount: { increment: 1 },
        lastVisitAt: new Date(),
        name: name || existing.name,
        acquisitionSource: acquisitionSource ?? existing.acquisitionSource,
      } as any,
    });
  }

  return tx.customer.create({
    data: {
      businessId,
      phone,
      name: name || "",
      visitCount: 1,
      lastVisitAt: new Date(),
      acquisitionSource,
    } as any,
  });
}
