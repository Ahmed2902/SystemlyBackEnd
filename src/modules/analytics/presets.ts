import { DateTime } from "luxon";

export const BUSINESS_TIMEZONE = "Africa/Cairo";

export const ANALYTICS_PRESETS = [
  "today",
  "last_week",
  "last_month",
  "last_3_months",
  "last_year",
  "all_time",
] as const;

export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number];
export type Granularity = "hour" | "day" | "week" | "month";

const PRESET_GRANULARITY: Record<AnalyticsPreset, Granularity> = {
  today: "hour",
  last_week: "day",
  last_month: "week",
  last_3_months: "week",
  last_year: "month",
  all_time: "month",
};

export interface ResolvedRange {
  from: Date;
  to: Date;
  granularity: Granularity;
}

/**
 * The ONLY place preset -> concrete date range logic lives.
 * businessCreatedAt is required for "all_time" since it has no relative anchor.
 */
export function resolveRange(
  preset: AnalyticsPreset,
  businessCreatedAt: Date,
): ResolvedRange {
  const now = DateTime.now().setZone(BUSINESS_TIMEZONE);
  const granularity = PRESET_GRANULARITY[preset];

  let from: DateTime;
  switch (preset) {
    case "today":
      from = now.startOf("day");
      break;
    case "last_week":
      from = now.minus({ days: 7 });
      break;
    case "last_month":
      from = now.minus({ days: 30 });
      break;
    case "last_3_months":
      from = now.minus({ months: 3 });
      break;
    case "last_year":
      from = now.minus({ years: 1 });
      break;
    case "all_time":
      from = DateTime.fromJSDate(businessCreatedAt).setZone(BUSINESS_TIMEZONE);
      break;
  }

  return {
    from: from.toUTC().toJSDate(),
    to: now.toUTC().toJSDate(),
    granularity,
  };
}
