import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import {
  getBusinessDayOfWeek,
  getBusinessDayRange,
  toBusinessTime,
} from "../../shared/utils/timezone";

export interface FreeInterval {
  start: DateTime;
  end: DateTime;
}

export async function computeStaffFreeIntervals(
  staffIds: string[],
  businessId: string,
  date: string,
  tz: string,
  excludeAppointmentId?: string,
): Promise<Map<string, FreeInterval[]>> {
  const dayOfWeek = getBusinessDayOfWeek(date, tz);
  const { start: dayStartRaw, end: dayEndRaw } = getBusinessDayRange(tz, date);
  const dayStart = DateTime.fromJSDate(dayStartRaw).setZone(tz);

  const [overrides, availabilities, appointmentServices, breaks] =
    await Promise.all([
      prisma.availabilityOverride.findMany({
        where: { staffId: { in: staffIds }, overrideDate: new Date(date) },
      }),
      prisma.availability.findMany({
        where: { staffId: { in: staffIds }, dayOfWeek },
      }),
      prisma.appointmentService.findMany({
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
      prisma.staffBreak.findMany({
        where: {
          staffId: { in: staffIds },
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
    const breakStart = toBusinessTime(brk.startTime, tz);
    const breakEnd = toBusinessTime(brk.endTime, tz);
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

  for (const sId of staffIds) {
    const override = overrideMap.get(sId);
    if (override?.isDayOff) {
      result.set(sId, []);
      continue;
    }

    let workStart: DateTime, workEnd: DateTime;
    if (override?.startTime && override?.endTime) {
      workStart = toBusinessTime(override.startTime, tz);
      workEnd = toBusinessTime(override.endTime, tz);
    } else {
      const avail = availMap.get(sId);
      if (!avail) {
        result.set(sId, []);
        continue;
      }
      workStart = toBusinessTime(avail.startTime, tz);
      workEnd = toBusinessTime(avail.endTime, tz);
    }

    // Anchor the time-of-day portion onto the actual requested date
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

    const busy = (busyByStaff.get(sId) ?? []).sort(
      (a, b) => a.start.toMillis() - b.start.toMillis(),
    );
    const free: FreeInterval[] = [];
    let cursor = workStart;
    for (const b of busy) {
      if (b.start > cursor) free.push({ start: cursor, end: b.start });
      if (b.end > cursor) cursor = b.end;
    }
    if (cursor < workEnd) free.push({ start: cursor, end: workEnd });

    result.set(sId, free);
  }

  return result;
}

export function isStaffFreeFor(
  freeIntervals: FreeInterval[],
  segmentStart: DateTime,
  segmentEnd: DateTime,
): boolean {
  return freeIntervals.some(
    (iv) => iv.start <= segmentStart && iv.end >= segmentEnd,
  );
}
