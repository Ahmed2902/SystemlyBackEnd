import { DateTime } from "luxon";
import type {
  AnalyticsGranularity,
  AnalyticsStatsQuery,
} from "../analytics.schema";
import type { AnalyticsBucketPoint } from "../analytics.types";

export const DEFAULT_ANALYTICS_GRANULARITY: AnalyticsGranularity = "daily";
export const ANALYTICS_CACHE_TTL_SECONDS = 120;

export const normalizeAnalyticsRange = (
  timezone: string,
  query?: AnalyticsStatsQuery,
) => {
  const now = DateTime.now().setZone(timezone);
  const from = query?.from
    ? DateTime.fromJSDate(query.from, { zone: "utc" }).setZone(timezone)
    : now.minus({ days: 89 });
  const to = query?.to
    ? DateTime.fromJSDate(query.to, { zone: "utc" }).setZone(timezone)
    : now;

  return {
    from: from.startOf("day").toUTC().toJSDate(),
    to: to.endOf("day").toUTC().toJSDate(),
    granularity: query?.granularity ?? DEFAULT_ANALYTICS_GRANULARITY,
    lapsedDays: query?.lapsedDays ?? 45,
  };
};

export const getAnalyticsCacheKey = (
  businessId: string,
  from: Date,
  to: Date,
  granularity: AnalyticsGranularity,
) => {
  return `analytics:${businessId}:${from.toISOString()}:${to.toISOString()}:${granularity}`;
};

const getBucketUnit = (granularity: AnalyticsGranularity) => {
  switch (granularity) {
    case "weekly":
      return "week";
    case "monthly":
      return "month";
    default:
      return "day";
  }
};

export const toBusinessDateTime = (value: Date | string, timezone: string) => {
  const instant = value instanceof Date ? value : new Date(value);
  return DateTime.fromJSDate(instant, { zone: "utc" }).setZone(timezone);
};

export const toBusinessTimeOfDayMinutes = (
  value: Date | string,
  timezone: string,
) => {
  const local = toBusinessDateTime(value, timezone);
  return local.hour * 60 + local.minute;
};

export const formatBucketKey = (
  bucket: DateTime,
  granularity: AnalyticsGranularity,
) => {
  switch (granularity) {
    case "weekly":
      return bucket.toFormat("kkkk-'W'WW");
    case "monthly":
      return bucket.toFormat("yyyy-LL");
    default:
      return bucket.toFormat("yyyy-LL-dd");
  }
};

export const formatBucketLabel = (
  bucket: DateTime,
  granularity: AnalyticsGranularity,
) => {
  switch (granularity) {
    case "weekly":
      return bucket.toFormat("DDD");
    case "monthly":
      return bucket.toFormat("LLLL yyyy");
    default:
      return bucket.toFormat("DDD");
  }
};

export const createBucketSeries = (
  from: Date,
  to: Date,
  timezone: string,
  granularity: AnalyticsGranularity,
) => {
  const cursorStart = toBusinessDateTime(from, timezone).startOf("day");
  const endLocal = toBusinessDateTime(to, timezone).endOf("day");
  const bucketStart =
    granularity === "weekly"
      ? cursorStart.startOf("week")
      : granularity === "monthly"
        ? cursorStart.startOf("month")
        : cursorStart;
  const step =
    granularity === "weekly"
      ? { weeks: 1 }
      : granularity === "monthly"
        ? { months: 1 }
        : { days: 1 };

  const buckets: AnalyticsBucketPoint[] = [];
  for (
    let cursor = bucketStart;
    cursor <= endLocal;
    cursor = cursor.plus(step)
  ) {
    buckets.push({
      key: formatBucketKey(cursor, granularity),
      label: formatBucketLabel(cursor, granularity),
      totalCents: 0,
      count: 0,
    });
  }

  return buckets;
};

export const analyticsBucketUnit = (granularity: AnalyticsGranularity) => {
  return getBucketUnit(granularity);
};

export const iterBusinessDays = (from: Date, to: Date, timezone: string) => {
  const start = toBusinessDateTime(from, timezone).startOf("day");
  const end = toBusinessDateTime(to, timezone).startOf("day");
  const days: DateTime[] = [];

  for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
    days.push(cursor);
  }

  return days;
};
