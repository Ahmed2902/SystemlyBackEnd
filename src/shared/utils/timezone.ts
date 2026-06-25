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
