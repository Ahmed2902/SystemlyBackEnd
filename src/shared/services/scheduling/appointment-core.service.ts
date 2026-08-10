import { BookingChannel, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { generateCancelToken } from "../../utils/token.util";
import { toUtcFromBusinessTime } from "../../utils/timezone";
import { resolveEligibleStaffBySelection } from "./eligibility.service";
import { lockStaffSchedulingDay } from "./scheduling-lock.service";
import {
  computeStaffFreeIntervals,
  isStaffFreeFor,
} from "./staff-free-intervals.service";
import type { ScheduledSegment, ServiceSelection } from "./types";

type TxClient = Prisma.TransactionClient;
type SchedulingError = Error & { statusCode?: number; code?: string };

function schedulingError(message: string, statusCode: number, code?: string) {
  const error = new Error(message) as SchedulingError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export interface CreateAppointmentCoreParams {
  businessId: string;
  selections: ServiceSelection[];
  startsAt: string;
  customerName: string;
  customerPhone: string;
  customerDateOfBirth?: string | null;
  customerGender?: "male" | "female" | null;
  notes?: string;
  acquisitionSource?: string;
  status: "pending" | "confirmed";
  generateToken: boolean;
  bookingChannel?: BookingChannel;
}

interface UpsertCustomerParams {
  businessId: string;
  phone: string;
  name?: string;
  dateOfBirth?: string | null;
  gender?: "male" | "female" | null;
  acquisitionSource?: string;
}

function toDateOfBirth(value: string | null | undefined) {
  if (value === undefined) return undefined;
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function scheduleServiceSegments(
  tx: TxClient,
  selections: ServiceSelection[],
  startsAt: string,
  timezone: string,
  businessId: string,
): Promise<ScheduledSegment[]> {
  if (selections.length === 0) {
    throw schedulingError("At least one service is required", 400);
  }

  const uniqueServiceIds = [
    ...new Set(selections.map((selection) => selection.serviceId)),
  ];
  const services = await tx.service.findMany({
    where: {
      id: { in: uniqueServiceIds },
      businessId,
      isActive: true,
    },
  });

  if (services.length !== uniqueServiceIds.length) {
    throw schedulingError("One or more services not found", 404);
  }

  const serviceById = new Map(services.map((service) => [service.id, service]));
  const startInstant = toUtcFromBusinessTime(startsAt, timezone);
  let segmentStart: DateTime<boolean> = DateTime.fromJSDate(startInstant).setZone(
    timezone,
  );

  if (!segmentStart.isValid) {
    throw schedulingError("Invalid appointment start time", 400, "INVALID_DATE");
  }

  const eligibleBySelection = await resolveEligibleStaffBySelection(
    tx,
    selections,
    businessId,
  );
  const allCandidateStaffIds = [...new Set(eligibleBySelection.flat())];
  if (allCandidateStaffIds.length === 0) {
    throw schedulingError(
      "No eligible staff member is available for the selected services.",
      409,
      "SLOT_TAKEN",
    );
  }

  const date = segmentStart.toFormat("yyyy-MM-dd");
  await lockStaffSchedulingDay(tx, {
    businessId,
    date,
    staffIds: allCandidateStaffIds,
  });

  const freeByStaff = await computeStaffFreeIntervals(
    allCandidateStaffIds,
    businessId,
    date,
    timezone,
    undefined,
    tx,
  );

  const segments: ScheduledSegment[] = [];
  for (let index = 0; index < selections.length; index += 1) {
    const selection = selections[index];
    const service = serviceById.get(selection.serviceId);
    if (!service) throw schedulingError("Service not found", 404);

    const segmentEnd: DateTime<boolean> = segmentStart.plus({
      minutes: service.durationMin,
    });
    const assignedStaff = eligibleBySelection[index].find((staffId) =>
      isStaffFreeFor(freeByStaff.get(staffId) ?? [], segmentStart, segmentEnd),
    );

    if (!assignedStaff) {
      throw schedulingError(
        "This time slot is no longer available for one of the selected services.",
        409,
        "SLOT_TAKEN",
      );
    }

    segments.push({
      serviceId: selection.serviceId,
      staffId: assignedStaff,
      start: segmentStart.toUTC().toJSDate(),
      end: segmentEnd.toUTC().toJSDate(),
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
  const timezone = business.timezone || "UTC";
  const segments = await scheduleServiceSegments(
    tx,
    params.selections,
    params.startsAt,
    timezone,
    business.id,
  );

  const customer = await upsertCustomer(tx, {
    businessId: business.id,
    phone: params.customerPhone,
    name: params.customerName,
    dateOfBirth: params.customerDateOfBirth,
    gender: params.customerGender,
    acquisitionSource: params.acquisitionSource,
  });

  const appointment = await tx.appointment.create({
    data: {
      businessId: business.id,
      staffId: segments[0].staffId,
      customerId: customer.id,
      startsAt: segments[0].start,
      endsAt: segments[segments.length - 1].end,
      status: params.status,
      cancelToken: params.generateToken ? generateCancelToken() : undefined,
      notes: params.notes || null,
      bookingChannel: params.bookingChannel ?? BookingChannel.UNKNOWN,
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
  const { businessId, phone, name, dateOfBirth, gender, acquisitionSource } = params;
  const existing = await tx.customer.findUnique({
    where: { businessId_phone: { businessId, phone } },
  });

  if (existing) {
    return tx.customer.update({
      where: { id: existing.id },
      data: {
        name: name?.trim() || existing.name,
        ...(dateOfBirth !== undefined
          ? { dateOfBirth: toDateOfBirth(dateOfBirth) }
          : {}),
        ...(gender !== undefined ? { gender } : {}),
        acquisitionSource: existing.acquisitionSource ?? acquisitionSource,
      },
    });
  }

  return tx.customer.create({
    data: {
      businessId,
      phone,
      name: name?.trim() || "",
      dateOfBirth: toDateOfBirth(dateOfBirth),
      gender: gender ?? null,
      acquisitionSource,
      visitCount: 0,
      noShowCount: 0,
      lastVisitAt: null,
    },
  });
}
