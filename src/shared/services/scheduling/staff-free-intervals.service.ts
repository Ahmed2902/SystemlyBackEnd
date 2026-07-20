import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  getBusinessDayOfWeek,
  getBusinessDayRange,
  toStoredTimeOfDay,
  toBusinessTime,
} from "../../utils/timezone";

export interface FreeInterval {
  start: DateTime;
  end: DateTime;
}

type SchedulingDb = Pick<
  Prisma.TransactionClient,
  "availabilityOverride" | "availability" | "appointmentService" | "staffBreak"
>;

export async function computeStaffFreeIntervals(
  staffIds: string[],
  businessId: string,
  date: string,
  tz: string,
  excludeAppointmentId?: string,
  db: SchedulingDb = prisma,
): Promise<Map<string, FreeInterval[]>> {
  const dayOfWeek = getBusinessDayOfWeek(date, tz);
  const { start: dayStartRaw, end: dayEndRaw } = getBusinessDayRange(tz, date);
  const dayStart = DateTime.fromJSDate(dayStartRaw).setZone(tz);

  const [overrides, availabilities, appointmentServices, breaks] =
    await Promise.all([
      db.availabilityOverride.findMany({
        where: {
          staffId: { in: staffIds },
          staff: { businessId },
          overrideDate: new Date(date),
        },
      }),
      db.availability.findMany({
        where: { staffId: { in: staffIds }, staff: { businessId }, dayOfWeek },
      }),
      db.appointmentService.findMany({
        where: {
          staffId: { in: staffIds },
          appointment: {
            ...(excludeAppointmentId
              ? { id: { not: excludeAppointmentId } }
              : {}),
            businessId,
            status: {
              notIn: ["cancelled_by_customer", "cancelled_by_business"],
            },
          },
          AND: [
            { startsAt: { lt: dayEndRaw } },
            { endsAt: { gt: dayStartRaw } },
          ],
        },
      }),
      db.staffBreak.findMany({
        where: {
          staffId: { in: staffIds },
          businessId,
          breakDate: new Date(date),
        },
      }),
    ]);

  const overrideMap = new Map(overrides.map((o) => [o.staffId, o]));
  const availMap = new Map(availabilities.map((a) => [a.staffId, a]));
  const busyByStaff = new Map<string, FreeInterval[]>();

  for (const seg of appointmentServices) {
    const arr = busyByStaff.get(seg.staffId) ?? [];
    arr.push({
      start: DateTime.fromJSDate(seg.startsAt).setZone(tz),
      end: DateTime.fromJSDate(seg.endsAt).setZone(tz),
    });
    busyByStaff.set(seg.staffId, arr);
  }

  for (const brk of breaks) {
    const arr = busyByStaff.get(brk.staffId) ?? [];
    const breakStart = toStoredTimeOfDay(brk.startTime);
    const breakEnd = toStoredTimeOfDay(brk.endTime);
    arr.push({
      start: dayStart.set({
        hour: breakStart.hour,
        minute: breakStart.minute,
        second: 0,
        millisecond: 0,
      }),
      end: dayStart.set({
        hour: breakEnd.hour,
        minute: breakEnd.minute,
        second: 0,
        millisecond: 0,
      }),
    });
    busyByStaff.set(brk.staffId, arr);
  }

  const result = new Map<string, FreeInterval[]>();

  for (const staffId of staffIds) {
    const override = overrideMap.get(staffId);
    if (override?.isDayOff) {
      result.set(staffId, []);
      continue;
    }

    let workStart: DateTime;
    let workEnd: DateTime;

    if (override?.startTime && override?.endTime) {
      workStart = toStoredTimeOfDay(override.startTime);
      workEnd = toStoredTimeOfDay(override.endTime);
    } else {
      const avail = availMap.get(staffId);
      if (!avail) {
        result.set(staffId, []);
        continue;
      }
      workStart = toStoredTimeOfDay(avail.startTime);
      workEnd = toStoredTimeOfDay(avail.endTime);
    }

    workStart = dayStart.set({
      hour: workStart.hour,
      minute: workStart.minute,
      second: 0,
      millisecond: 0,
    });
    workEnd = dayStart.set({
      hour: workEnd.hour,
      minute: workEnd.minute,
      second: 0,
      millisecond: 0,
    });

    const busy = (busyByStaff.get(staffId) ?? []).sort(
      (a, b) => a.start.toMillis() - b.start.toMillis(),
    );

    const free: FreeInterval[] = [];
    let cursor = workStart;
    for (const interval of busy) {
      if (interval.start > cursor)
        free.push({ start: cursor, end: interval.start });
      if (interval.end > cursor) cursor = interval.end;
    }
    if (cursor < workEnd) free.push({ start: cursor, end: workEnd });

    result.set(staffId, free);
  }

  return result;
}

export function isStaffFreeFor(
  freeIntervals: FreeInterval[],
  segmentStart: DateTime,
  segmentEnd: DateTime,
): boolean {
  return freeIntervals.some(
    (interval) => interval.start <= segmentStart && interval.end >= segmentEnd,
  );
}
