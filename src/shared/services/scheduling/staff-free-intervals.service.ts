import { DateTime } from "luxon";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import {
  getBusinessDayOfWeek,
  getBusinessDayRange,
  toStoredTimeOfDay,
} from "../../utils/timezone";

export interface FreeInterval {
  start: DateTime;
  end: DateTime;
}

type SchedulingDb = Pick<
  Prisma.TransactionClient,
  "availabilityOverride" | "availability" | "appointmentService" | "staffBreak" | "staffTimeOff"
>;

function onBusinessDay(dayStart: DateTime, stored: Date) {
  const value = toStoredTimeOfDay(stored);
  return dayStart.set({
    hour: value.hour,
    minute: value.minute,
    second: 0,
    millisecond: 0,
  });
}

function subtractBusy(work: FreeInterval, busy: FreeInterval[]) {
  const free: FreeInterval[] = [];
  let cursor = work.start;

  for (const interval of busy) {
    if (interval.end <= work.start || interval.start >= work.end) continue;
    const start = interval.start < work.start ? work.start : interval.start;
    const end = interval.end > work.end ? work.end : interval.end;
    if (start > cursor) free.push({ start: cursor, end: start });
    if (end > cursor) cursor = end;
    if (cursor >= work.end) break;
  }

  if (cursor < work.end) free.push({ start: cursor, end: work.end });
  return free;
}

export async function computeStaffFreeIntervals(
  staffIds: string[],
  businessId: string,
  date: string,
  tz: string,
  excludeAppointmentId?: string,
  db: SchedulingDb = prisma,
): Promise<Map<string, FreeInterval[]>> {
  if (staffIds.length === 0) return new Map();

  const dayOfWeek = getBusinessDayOfWeek(date, tz);
  const { start: dayStartRaw, end: dayEndRaw } = getBusinessDayRange(tz, date);
  const dayStart = DateTime.fromJSDate(dayStartRaw).setZone(tz);
  const dateValue = new Date(`${date}T00:00:00.000Z`);

  const [overrides, availabilities, appointments, breaks, timeOff] =
    await Promise.all([
      db.availabilityOverride.findMany({
        where: {
          staffId: { in: staffIds },
          staff: { businessId },
          overrideDate: dateValue,
        },
      }),
      db.availability.findMany({
        where: { staffId: { in: staffIds }, staff: { businessId }, dayOfWeek },
        orderBy: [{ staffId: "asc" }, { startTime: "asc" }],
      }),
      db.appointmentService.findMany({
        where: {
          staffId: { in: staffIds },
          appointment: {
            ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
            businessId,
            status: { notIn: ["cancelled_by_customer", "cancelled_by_business"] },
          },
          AND: [
            { startsAt: { lt: dayEndRaw } },
            { endsAt: { gt: dayStartRaw } },
          ],
        },
      }),
      db.staffBreak.findMany({
        where: { staffId: { in: staffIds }, businessId, breakDate: dateValue },
      }),
      db.staffTimeOff.findMany({
        where: {
          staffId: { in: staffIds },
          businessId,
          startsOn: { lte: dateValue },
          endsOn: { gte: dateValue },
        },
        select: { staffId: true },
      }),
    ]);

  const overrideByStaff = new Map(overrides.map((row) => [row.staffId, row]));
  const availabilityByStaff = new Map<string, typeof availabilities>();
  const busyByStaff = new Map<string, FreeInterval[]>();
  const staffOnTimeOff = new Set(timeOff.map((row) => row.staffId));

  for (const row of availabilities) {
    const rows = availabilityByStaff.get(row.staffId) ?? [];
    rows.push(row);
    availabilityByStaff.set(row.staffId, rows);
  }

  for (const row of appointments) {
    const rows = busyByStaff.get(row.staffId) ?? [];
    rows.push({
      start: DateTime.fromJSDate(row.startsAt).setZone(tz),
      end: DateTime.fromJSDate(row.endsAt).setZone(tz),
    });
    busyByStaff.set(row.staffId, rows);
  }

  for (const row of breaks) {
    const rows = busyByStaff.get(row.staffId) ?? [];
    rows.push({
      start: onBusinessDay(dayStart, row.startTime),
      end: onBusinessDay(dayStart, row.endTime),
    });
    busyByStaff.set(row.staffId, rows);
  }

  const result = new Map<string, FreeInterval[]>();

  for (const staffId of staffIds) {
    const override = overrideByStaff.get(staffId);
    if (staffOnTimeOff.has(staffId) || override?.isDayOff) {
      result.set(staffId, []);
      continue;
    }

    const workIntervals: FreeInterval[] =
      override?.startTime && override?.endTime
        ? [{
            start: onBusinessDay(dayStart, override.startTime),
            end: onBusinessDay(dayStart, override.endTime),
          }]
        : (availabilityByStaff.get(staffId) ?? []).map((row) => ({
            start: onBusinessDay(dayStart, row.startTime),
            end: onBusinessDay(dayStart, row.endTime),
          }));

    const busy = (busyByStaff.get(staffId) ?? []).sort(
      (a, b) => a.start.toMillis() - b.start.toMillis(),
    );

    result.set(
      staffId,
      workIntervals
        .flatMap((work) => subtractBusy(work, busy))
        .sort((a, b) => a.start.toMillis() - b.start.toMillis()),
    );
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
