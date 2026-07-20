import { DateTime } from "luxon";
import { prisma } from "../../db/prisma";
import { getBusinessDayRange } from "../../utils/timezone";
import {
  computeStaffFreeIntervals,
  isStaffFreeFor,
} from "./staff-free-intervals.service";
import { resolveEligibleStaffBySelection } from "./eligibility.service";
import type { AvailableSlot, ServiceSelection } from "./types";

const SLOT_INTERVAL_MIN = 15;

export async function buildAvailabilitySlots(opts: {
  businessId: string;
  date: string;
  timezone: string;
  selections: ServiceSelection[];
}) {
  const { businessId, date, timezone, selections } = opts;

  const serviceIds = selections.map((s) => s.serviceId);
  const uniqueServiceIds = [...new Set(serviceIds)];

  const serviceRows = await prisma.service.findMany({
    where: { id: { in: uniqueServiceIds }, businessId, isActive: true },
  });

  if (serviceRows.length !== uniqueServiceIds.length) {
    throw new Error("One or more services not found");
  }

  const serviceById = new Map(
    serviceRows.map((service) => [service.id, service]),
  );

  const eligibleByService = await resolveEligibleStaffBySelection(
    prisma,
    selections,
    businessId,
  );
  if (eligibleByService.some((eligible) => eligible.length === 0)) {
    return [] as AvailableSlot[];
  }

  const allStaffIds = [...new Set(eligibleByService.flat())];
  const freeByStaff = await computeStaffFreeIntervals(
    allStaffIds,
    businessId,
    date,
    timezone,
  );

  const { start: dayStartRaw, end: dayEndRaw } = getBusinessDayRange(
    timezone,
    date,
  );
  const dayStart = DateTime.fromJSDate(dayStartRaw).setZone(timezone);
  const dayEnd = DateTime.fromJSDate(dayEndRaw).setZone(timezone);

  const totalDuration = selections.reduce(
    (sum, selection) => sum + serviceById.get(selection.serviceId)!.durationMin,
    0,
  );

  const now = DateTime.now().setZone(timezone);
  let candidate = dayStart;
  if (candidate < now) {
    const rounded = now.startOf("minute");
    const remainder = rounded.minute % SLOT_INTERVAL_MIN;
    candidate = rounded.plus({
      minutes: remainder === 0 ? SLOT_INTERVAL_MIN : SLOT_INTERVAL_MIN - remainder,
    });
  }

  const slots: AvailableSlot[] = [];

  while (candidate.plus({ minutes: totalDuration }) <= dayEnd) {
    let segmentStart = candidate;
    let valid = true;
    const assignments: AvailableSlot["assignments"] = [];

    for (let i = 0; i < selections.length; i++) {
      const selection = selections[i];
      const segmentDuration = serviceById.get(selection.serviceId)!.durationMin;
      const segmentEnd = segmentStart.plus({ minutes: segmentDuration });

      const assignedStaff = eligibleByService[i].find((staffId) =>
        isStaffFreeFor(
          freeByStaff.get(staffId) ?? [],
          segmentStart,
          segmentEnd,
        ),
      );

      if (!assignedStaff) {
        valid = false;
        break;
      }

      assignments.push({
        serviceId: selection.serviceId,
        staffId: assignedStaff,
      });
      segmentStart = segmentEnd;
    }

    if (valid) {
      slots.push({
        time: candidate.toUTC().toISO()!,
        display: candidate.toFormat("HH:mm"),
        assignments,
      });
    }

    candidate = candidate.plus({ minutes: SLOT_INTERVAL_MIN });
  }

  return slots;
}
