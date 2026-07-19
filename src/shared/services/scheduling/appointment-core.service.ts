import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { toUtcFromBusinessTime } from "../../utils/timezone";
import { generateCancelToken } from "../../utils/token.util";
import {
  computeStaffFreeIntervals,
  isStaffFreeFor,
} from "./staff-free-intervals.service";
import { resolveEligibleStaffBySelection } from "./eligibility.service";
import type { ScheduledSegment, ServiceSelection } from "./types";

type TxClient = Prisma.TransactionClient;

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

export async function scheduleServiceSegments(
  tx: TxClient,
  selections: ServiceSelection[],
  startsAt: string,
  timezone: string,
  businessId: string,
): Promise<ScheduledSegment[]> {
  const serviceIds = selections.map((selection) => selection.serviceId);
  const services = await tx.service.findMany({
    where: { id: { in: serviceIds } },
  });

  if (services.length !== serviceIds.length) {
    const err: any = new Error("One or more services not found");
    err.statusCode = 404;
    throw err;
  }

  const serviceById = new Map(services.map((service) => [service.id, service]));

  let segmentStart = /(?:Z|[+-]\d\d:\d\d)$/.test(startsAt)
    ? DateTime.fromJSDate(new Date(startsAt)).setZone(timezone)
    : DateTime.fromJSDate(toUtcFromBusinessTime(startsAt, timezone)).setZone(
        timezone,
      );

  const eligibleBySelection = await resolveEligibleStaffBySelection(
    tx,
    selections,
  );
  const allCandidateStaffIds = [...new Set(eligibleBySelection.flat())];

  const date = segmentStart.toFormat("yyyy-MM-dd");
  const freeByStaff = await computeStaffFreeIntervals(
    allCandidateStaffIds,
    businessId,
    date,
    timezone,
  );

  const segments: ScheduledSegment[] = [];

  for (let i = 0; i < selections.length; i++) {
    const selection = selections[i];
    const service = serviceById.get(selection.serviceId)!;
    const segmentEnd = segmentStart.plus({ minutes: service.durationMin });

    const assignedStaff = eligibleBySelection[i].find((staffId) =>
      isStaffFreeFor(freeByStaff.get(staffId) ?? [], segmentStart, segmentEnd),
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
      serviceId: selection.serviceId,
      staffId: assignedStaff,
      start: segmentStart.toJSDate(),
      end: segmentEnd.toJSDate(),
      durationMin: service.durationMin,
      priceEgp: Number(service.priceEgp),
    });

    segmentStart = segmentEnd;
  }

  return segments;
}

export async function createAppointmentCore(
  tx: TxClient,
  business: { id: string; timezone?: string | null },
  params: CreateAppointmentCoreParams,
) {
  const timezone = params.timezone || business.timezone || "UTC";

  const segments = await scheduleServiceSegments(
    tx,
    params.selections,
    params.startsAt,
    timezone,
    business.id,
  );

  const customer = await upsertCustomer(tx, {
    businessId: params.businessId,
    phone: params.customerPhone,
    name: params.customerName,
    acquisitionSource: params.acquisitionSource,
  });

  const appointment = await tx.appointment.create({
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
    data: segments.map((segment, index) => ({
      appointmentId: appointment.id,
      serviceId: segment.serviceId,
      staffId: segment.staffId,
      order: index,
      startsAt: segment.start,
      endsAt: segment.end,
      durationMinSnapshot: segment.durationMin,
      priceEgpSnapshot: segment.priceEgp,
    })),
  });

  return { appointment, customer };
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
