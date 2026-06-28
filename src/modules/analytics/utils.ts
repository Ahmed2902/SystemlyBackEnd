import { Granularity } from "./presets";

const ALLOWED_GRANULARITIES: Granularity[] = ["hour", "day", "week", "month"];

/**
 * DATE_TRUNC's unit argument is always derived server-side via resolveRange()
 * and never comes from raw user input -- this guard is defense-in-depth,
 * not a workaround for a SQL limitation.
 */
export function assertSafeGranularity(value: string): Granularity {
  if (!ALLOWED_GRANULARITIES.includes(value as Granularity)) {
    throw new Error(`Invalid granularity: ${value}`);
  }
  return value as Granularity;
}

export type LeadTimeBucket =
  | "same_day"
  | "1_2_days"
  | "3_7_days"
  | "1_week_plus";

export function bucketLeadTimeDays(diffDays: number): LeadTimeBucket {
  if (diffDays <= 0) return "same_day";
  if (diffDays <= 2) return "1_2_days";
  if (diffDays <= 7) return "3_7_days";
  return "1_week_plus";
}
