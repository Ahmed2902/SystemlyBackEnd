import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { buildDateTime, parseISOToTZ } from "./dates.util";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface BookedSlot {
  starts_at: string | Date;
  ends_at: string | Date;
}

export interface GenerateSlotsParams {
  date: string;
  startTime: string;
  endTime: string;
  durationMin: number;
  breakAfterMin?: number;
  bookedSlots?: BookedSlot[];
  staffId?: string | number;
  timezone?: string;
  now?: string | Date;

  // 15 is a good default for salons
  slotIntervalMin?: number;
}

export interface Slot {
  time: string;
  display: string;
  staffId?: string | number;
}

type Interval = {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
};

export const generateSlots = (params: GenerateSlotsParams): Slot[] => {
  const {
    date,
    startTime,
    endTime,
    durationMin,
    breakAfterMin = 0,
    bookedSlots = [],
    staffId,
    timezone = "UTC",
    now,
    slotIntervalMin = 15,
  } = params;

  const businessNow = now ? dayjs(now).tz(timezone) : dayjs().tz(timezone);

  const workingStart = buildDateTime(date, startTime, timezone);

  const workingEnd = buildDateTime(date, endTime, timezone);

  const busyIntervals: Interval[] = bookedSlots
    .map((booked) => {
      const rawStart = (booked as any).starts_at || (booked as any).startsAt;

      const rawEnd = (booked as any).ends_at || (booked as any).endsAt;

      let start = parseISOToTZ(rawStart, timezone);

      let end = parseISOToTZ(rawEnd, timezone).add(breakAfterMin, "minute");

      if (start.isBefore(workingStart)) {
        start = workingStart;
      }

      if (end.isAfter(workingEnd)) {
        end = workingEnd;
      }

      return { start, end };
    })
    .filter((i) => i.end.isAfter(workingStart) && i.start.isBefore(workingEnd))
    .sort((a, b) => a.start.valueOf() - b.start.valueOf());

  const mergedBusy: Interval[] = [];

  for (const current of busyIntervals) {
    const last = mergedBusy[mergedBusy.length - 1];

    if (
      last &&
      (current.start.isBefore(last.end) || current.start.isSame(last.end))
    ) {
      if (current.end.isAfter(last.end)) {
        last.end = current.end;
      }
    } else {
      mergedBusy.push({
        start: current.start,
        end: current.end,
      });
    }
  }

  const freeIntervals: Interval[] = [];

  let cursor = workingStart;

  for (const busy of mergedBusy) {
    if (busy.start.isAfter(cursor)) {
      freeIntervals.push({
        start: cursor,
        end: busy.start,
      });
    }

    if (busy.end.isAfter(cursor)) {
      cursor = busy.end;
    }
  }

  if (cursor.isBefore(workingEnd)) {
    freeIntervals.push({
      start: cursor,
      end: workingEnd,
    });
  }

  const slots: Slot[] = [];

  for (const free of freeIntervals) {
    let slotStart = free.start.isBefore(businessNow) ? businessNow : free.start;

    const remainder = slotStart.minute() % slotIntervalMin;

    if (remainder !== 0) {
      slotStart = slotStart
        .add(slotIntervalMin - remainder, "minute")
        .second(0)
        .millisecond(0);
    }

    while (true) {
      const appointmentEnd = slotStart.add(durationMin, "minute");

      if (appointmentEnd.isAfter(free.end)) {
        break;
      }

      slots.push({
        time: slotStart.toISOString(),
        display: slotStart.format("HH:mm"),
        staffId,
      });

      slotStart = slotStart.add(slotIntervalMin, "minute");
    }
  }

  return slots;
};

export default { generateSlots };
