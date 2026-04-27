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
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationMin: number;
  breakAfterMin?: number;
  bookedSlots: BookedSlot[];
  staffId?: string | number;
  timezone?: string; // IANA tz
  now?: string | Date;
}

export interface Slot {
  time: string; // ISO string (UTC)
  display: string; // human-friendly in business tz
  staffId?: string | number;
}

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
  } = params;

  const slots: Slot[] = [];

  const businessNow = now ? dayjs(now).tz(timezone) : null;

  let current = buildDateTime(date, startTime, timezone);
  const dayEnd = buildDateTime(date, endTime, timezone);

  while (true) {
    const slotEnd = current.add(durationMin, "minute");
    if (slotEnd.isAfter(dayEnd)) break;

    const slotStart = current;

    // If a 'now' is provided, skip slots in the past relative to that moment
    if (businessNow && slotStart.isBefore(businessNow)) {
      current = current.add(durationMin, "minute");
      continue;
    }

    // Check overlap against every existing appointment (including buffer)
    const conflicts = bookedSlots
      .map((booked) => {
        const rawStart: any =
          (booked as any).starts_at || (booked as any).startsAt;
        const rawEnd: any = (booked as any).ends_at || (booked as any).endsAt;
        const bookedStart = parseISOToTZ(rawStart, timezone);
        const bookedEnd = parseISOToTZ(rawEnd, timezone).add(
          breakAfterMin,
          "minute"
        );
        return { bookedStart, bookedEnd };
      })
      .filter(
        ({ bookedStart, bookedEnd }) =>
          slotStart.isBefore(bookedEnd) && slotEnd.isAfter(bookedStart)
      );

    if (conflicts.length === 0) {
      slots.push({
        time: slotStart.toISOString(),
        display: slotStart.format("HH:mm"),
        staffId,
      });
      // advance by service duration
      current = current.add(durationMin, "minute");
      continue;
    }

    // If there is a conflict, jump to the end of the latest conflicting appointment (including buffer)
    const latestEnd = conflicts.reduce(
      (max, c) => (c.bookedEnd.isAfter(max) ? c.bookedEnd : max),
      conflicts[0].bookedEnd
    );
    current = latestEnd;
    continue;
  }

  return slots;
};

export default { generateSlots };
