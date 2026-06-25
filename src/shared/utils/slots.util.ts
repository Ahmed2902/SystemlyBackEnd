import { DateTime } from "luxon";
import { buildDateTime, parseISOToTZ } from "./dates.util";

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
  start: DateTime;
  end: DateTime;
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

  const businessNow = now
    ? parseISOToTZ(now, timezone)
    : DateTime.now().setZone(timezone);

  const workingStart = buildDateTime(date, startTime, timezone);

  const workingEnd = buildDateTime(date, endTime, timezone);

  const busyIntervals: Interval[] = bookedSlots
    .map((booked) => {
      const rawStart = (booked as any).starts_at || (booked as any).startsAt;

      const rawEnd = (booked as any).ends_at || (booked as any).endsAt;

      let start = parseISOToTZ(rawStart, timezone);

      let end = parseISOToTZ(rawEnd, timezone).plus({ minutes: breakAfterMin });

      if (start < workingStart) {
        start = workingStart;
      }

      if (end > workingEnd) {
        end = workingEnd;
      }

      return { start, end };
    })
    .filter(
      (i) =>
        i.end.toMillis() > workingStart.toMillis() &&
        i.start.toMillis() < workingEnd.toMillis(),
    )
    .sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const mergedBusy: Interval[] = [];

  for (const current of busyIntervals) {
    const last = mergedBusy[mergedBusy.length - 1];

    if (last && (current.start < last.end || current.start.equals(last.end))) {
      if (current.end > last.end) {
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
    if (busy.start > cursor) {
      freeIntervals.push({
        start: cursor,
        end: busy.start,
      });
    }

    if (busy.end > cursor) {
      cursor = busy.end;
    }
  }

  if (cursor < workingEnd) {
    freeIntervals.push({
      start: cursor,
      end: workingEnd,
    });
  }

  const slots: Slot[] = [];

  for (const free of freeIntervals) {
    let slotStart = free.start < businessNow ? businessNow : free.start;

    const remainder = slotStart.minute % slotIntervalMin;

    if (remainder !== 0) {
      slotStart = slotStart.plus({ minutes: slotIntervalMin - remainder }).set({
        second: 0,
        millisecond: 0,
      });
    }

    while (true) {
      const appointmentEnd = slotStart.plus({ minutes: durationMin });

      if (appointmentEnd > free.end) {
        break;
      }

      slots.push({
        time: slotStart.toUTC().toJSDate().toISOString(),
        display: slotStart.toFormat("HH:mm"),
        staffId,
      });

      slotStart = slotStart.plus({ minutes: slotIntervalMin });
    }
  }

  return slots;
};

export default { generateSlots };
