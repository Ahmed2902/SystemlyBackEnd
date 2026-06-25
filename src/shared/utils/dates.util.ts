import { DateTime } from "luxon";

const DEFAULT_TIMEZONE = "UTC";

const assertValid = (dateTime: DateTime, input: string) => {
  if (!dateTime.isValid) {
    throw new Error(
      `Invalid date/time value: ${dateTime.invalidExplanation || input}`,
    );
  }

  return dateTime;
};

export const buildDateTime = (date: string, time: string, tz = "UTC") => {
  // date: YYYY-MM-DD, time: HH:mm
  const dateTime = DateTime.fromFormat(`${date} ${time}`, "yyyy-MM-dd HH:mm", {
    zone: tz || DEFAULT_TIMEZONE,
  });

  return assertValid(dateTime, `${date} ${time}`);
};

export const parseISOToTZ = (iso: string | Date, tz = "UTC") => {
  const zone = tz || DEFAULT_TIMEZONE;
  const dateTime =
    iso instanceof Date
      ? DateTime.fromJSDate(iso, { zone: "utc" }).setZone(zone)
      : DateTime.fromISO(iso, { setZone: true }).setZone(zone);

  return assertValid(dateTime, String(iso));
};

export const toUTCDate = (d: DateTime) => {
  return d.toUTC().toJSDate();
};

export const startOfDay = (date: string, tz = "UTC") => {
  const dateTime = DateTime.fromISO(date, { zone: tz || DEFAULT_TIMEZONE });
  return assertValid(dateTime.startOf("day"), date);
};

export const endOfDay = (date: string, tz = "UTC") => {
  const dateTime = DateTime.fromISO(date, { zone: tz || DEFAULT_TIMEZONE });
  return assertValid(dateTime.endOf("day"), date);
};

export default {
  buildDateTime,
  parseISOToTZ,
  toUTCDate,
  startOfDay,
  endOfDay,
};
