import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

export const buildDateTime = (date: string, time: string, tz = "UTC") => {
  // date: YYYY-MM-DD, time: HH:mm
  return dayjs.tz(`${date} ${time}`, "YYYY-MM-DD HH:mm", tz);
};

export const parseISOToTZ = (iso: string | Date, tz = "UTC") => {
  return dayjs(iso).tz(tz);
};

export const toUTCDate = (d: dayjs.Dayjs) => {
  return d.toDate();
};

export const startOfDay = (date: string, tz = "UTC") => {
  return dayjs.tz(date, "YYYY-MM-DD", tz).startOf("day");
};

export const endOfDay = (date: string, tz = "UTC") => {
  return dayjs.tz(date, "YYYY-MM-DD", tz).endOf("day");
};

export default {
  buildDateTime,
  parseISOToTZ,
  toUTCDate,
  startOfDay,
  endOfDay,
};
