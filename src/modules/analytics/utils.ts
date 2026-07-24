import { Granularity } from "./presets";

const ALLOWED_GRANULARITIES: Granularity[] = ["hour", "day", "week", "month"];

export function assertSafeGranularity(value: string): Granularity {
  if (!ALLOWED_GRANULARITIES.includes(value as Granularity)) {
    throw new Error(`Invalid granularity: ${value}`);
  }
  return value as Granularity;
}

export type LeadTimeBucket =
  | "same_day"
  | "1_3_days"
  | "4_7_days"
  | "8_14_days"
  | "15_plus_days";

export function bucketLeadTimeDays(diffDays: number): LeadTimeBucket {
  if (diffDays <= 0) return "same_day";
  if (diffDays <= 3) return "1_3_days";
  if (diffDays <= 7) return "4_7_days";
  if (diffDays <= 14) return "8_14_days";
  return "15_plus_days";
}
