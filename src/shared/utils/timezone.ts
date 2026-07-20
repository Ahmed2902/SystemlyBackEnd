import { DateTime } from "luxon";

export type BusinessDateRange = {
  start: Date;
  end: Date;
};

const DEFAULT_TIMEZONE = "UTC";
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeTimezone = (timezone?: string) => timezone || DEFAULT_TIMEZONE;

const isDateOnlyString = (value: string) => DATE_ONLY_PATTERN.test(value);

const toAnchorDateTime = (value: Date | string, timezone: string) => {
  const zone = normalizeTimezone(timezone);

  if (typeof value === "string" && isDateOnlyString(value)) {
    return DateTime.fromISO(value, { zone });
  }

  const instant = value instanceof Date ? value : new Date(value);
  return DateTime.fromJSDate(instant, { zone: "utc" }).setZone(zone);
};

export const toBusinessTime = (date: Date | string, timezone: string) => {
  return toAnchorDateTime(date, timezone);
};

/**
 * Availability, breaks, and override times are stored as time-only values
 * using the UTC epoch as a neutral container. Do not shift these by timezone.
 */
export const toStoredTimeOfDay = (value: Date | string) => {
  const date =
    typeof value === "string" && /^\d{2}:\d{2}$/.test(value)
      ? timeOfDayToDate(value)
      : value instanceof Date
        ? value
        : new Date(value);
  return DateTime.fromJSDate(date, { zone: "utc" });
};

export const timeOfDayToDate = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`Invalid time of day: ${value}`);
  }
  return new Date(
    `1970-01-01T${match[1]}:${match[2]}:00.000Z`,
  );
};

export const toUtcFromBusinessTime = (
  localIsoString: string,
  timezone: string,
) => {
  const zone = normalizeTimezone(timezone);
  const parsed = DateTime.fromISO(localIsoString, { zone });

  if (!parsed.isValid) {
    throw new Error(
      `Invalid business-time timestamp: ${parsed.invalidExplanation || localIsoString}`,
    );
  }

  return parsed.toUTC().toJSDate();
};

export const getBusinessDayRange = (
  timezone: string,
  date: Date | string = new Date(),
): BusinessDateRange => {
  const local = toAnchorDateTime(date, timezone).startOf("day");
  return {
    start: local.toUTC().toJSDate(),
    end: local.endOf("day").toUTC().toJSDate(),
  };
};

export const getBusinessWeekRange = (
  timezone: string,
  date: Date | string = new Date(),
): BusinessDateRange => {
  const local = toAnchorDateTime(date, timezone).startOf("day");
  const start = local.minus({ days: local.weekday - 1 }).startOf("day");
  const end = start.plus({ days: 6 }).endOf("day");

  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
  };
};

export const getBusinessMonthRange = (
  timezone: string,
  date: Date | string = new Date(),
): BusinessDateRange => {
  const local = toAnchorDateTime(date, timezone);
  const start = local.startOf("month");
  const end = local.endOf("month");

  return {
    start: start.toUTC().toJSDate(),
    end: end.toUTC().toJSDate(),
  };
};

export const getBusinessDayOfWeek = (date: Date | string, timezone: string) => {
  const local = toAnchorDateTime(date, timezone);
  return local.weekday % 7;
};
