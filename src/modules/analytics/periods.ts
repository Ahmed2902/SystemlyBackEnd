import { DateTime } from "luxon";
import { Errors } from "../../shared/errors/application-error";

export const DEFAULT_BUSINESS_TIMEZONE = "Africa/Cairo";

export const ROLLING_PRESETS = [
  "today",
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "last_12_months",
  "all_time",
] as const;

export const LEGACY_PRESET_ALIASES = {
  last_week: "last_7_days",
  last_month: "last_30_days",
  last_3_months: "last_90_days",
  last_year: "last_12_months",
} as const;

export const COMPLETED_PERIOD_COUNTS = [2, 3, 4, 6, 12] as const;

export type RollingPreset = (typeof ROLLING_PRESETS)[number];
export type LegacyAnalyticsPreset = keyof typeof LEGACY_PRESET_ALIASES;
export type CompletedPeriodCount = (typeof COMPLETED_PERIOD_COUNTS)[number];
export type CompletedPeriodUnit = "week" | "month";
export type Granularity = "hour" | "day" | "week" | "month";

export type AnalyticsPeriodInput =
  | { mode: "rolling"; preset: RollingPreset }
  | {
      mode: "completed";
      unit: CompletedPeriodUnit;
      count: CompletedPeriodCount;
    }
  | { mode: "custom"; from: string; to: string };

export interface PeriodBoundary {
  from: Date;
  toExclusive: Date;
}

export interface ResolvedAnalyticsPeriod extends PeriodBoundary {
  mode: AnalyticsPeriodInput["mode"];
  timezone: string;
  granularity: Granularity;
  isComplete: boolean;
  label: string;
  comparison: PeriodBoundary | null;
  input: AnalyticsPeriodInput;
}

export type Clock = () => Date;

export function normalizeRollingPreset(
  value: RollingPreset | LegacyAnalyticsPreset,
): RollingPreset {
  return value in LEGACY_PRESET_ALIASES
    ? LEGACY_PRESET_ALIASES[value as LegacyAnalyticsPreset]
    : (value as RollingPreset);
}

export function automaticGranularity(durationDays: number): Granularity {
  if (durationDays <= 1) return "hour";
  if (durationDays <= 14) return "day";
  if (durationDays <= 90) return "week";
  return "month";
}

function exactLocalDate(value: string, timezone: string): DateTime {
  const parsed = DateTime.fromISO(value, { zone: timezone }).startOf("day");
  if (!parsed.isValid || parsed.toISODate() !== value) {
    throw Errors.validation({ date: value }, "Invalid analytics date.");
  }
  return parsed;
}

function equalDurationComparison(from: DateTime, toExclusive: DateTime) {
  const durationMs = toExclusive.toMillis() - from.toMillis();
  return {
    from: from.minus({ milliseconds: durationMs }).toUTC().toJSDate(),
    toExclusive: from.toUTC().toJSDate(),
  };
}

function resolveRolling(
  input: Extract<AnalyticsPeriodInput, { mode: "rolling" }>,
  timezone: string,
  businessCreatedAt: Date,
  now: DateTime,
): ResolvedAnalyticsPeriod {
  let from: DateTime;
  let granularity: Granularity;

  switch (input.preset) {
    case "today":
      from = now.startOf("day");
      granularity = "hour";
      break;
    case "last_7_days":
      from = now.minus({ days: 7 });
      granularity = "day";
      break;
    case "last_30_days":
      from = now.minus({ days: 30 });
      granularity = "week";
      break;
    case "last_90_days":
      from = now.minus({ days: 90 });
      granularity = "week";
      break;
    case "last_12_months":
      from = now.minus({ months: 12 });
      granularity = "month";
      break;
    case "all_time":
      from = DateTime.fromJSDate(businessCreatedAt, { zone: "utc" }).setZone(
        timezone,
      );
      granularity = automaticGranularity(now.diff(from, "days").days);
      break;
  }

  const comparison =
    input.preset === "all_time"
      ? null
      : equalDurationComparison(from, now);

  return {
    input,
    mode: "rolling",
    timezone,
    from: from.toUTC().toJSDate(),
    toExclusive: now.toUTC().toJSDate(),
    granularity,
    isComplete: false,
    label: input.preset,
    comparison,
  };
}

function subtractCompletedPeriods(
  value: DateTime,
  unit: CompletedPeriodUnit,
  count: number,
) {
  return unit === "month"
    ? value.minus({ months: count })
    : value.minus({ weeks: count });
}

function resolveCompleted(
  input: Extract<AnalyticsPeriodInput, { mode: "completed" }>,
  timezone: string,
  now: DateTime,
): ResolvedAnalyticsPeriod {
  const toExclusive =
    input.unit === "month" ? now.startOf("month") : now.startOf("week");
  const from = subtractCompletedPeriods(
    toExclusive,
    input.unit,
    input.count,
  );
  const comparisonFrom = subtractCompletedPeriods(
    from,
    input.unit,
    input.count,
  );

  return {
    input,
    mode: "completed",
    timezone,
    from: from.toUTC().toJSDate(),
    toExclusive: toExclusive.toUTC().toJSDate(),
    granularity: input.unit,
    isComplete: true,
    label: `last_${input.count}_complete_${input.unit}s`,
    comparison: {
      from: comparisonFrom.toUTC().toJSDate(),
      toExclusive: from.toUTC().toJSDate(),
    },
  };
}

function resolveCustom(
  input: Extract<AnalyticsPeriodInput, { mode: "custom" }>,
  timezone: string,
): ResolvedAnalyticsPeriod {
  const from = exactLocalDate(input.from, timezone);
  const toExclusive = exactLocalDate(input.to, timezone).plus({ days: 1 });
  if (toExclusive <= from) {
    throw Errors.validation(
      { from: input.from, to: input.to },
      "The analytics end date must not be before the start date.",
    );
  }

  const durationDays = toExclusive.diff(from, "days").days;
  return {
    input,
    mode: "custom",
    timezone,
    from: from.toUTC().toJSDate(),
    toExclusive: toExclusive.toUTC().toJSDate(),
    granularity: automaticGranularity(durationDays),
    isComplete: true,
    label: `${input.from}_to_${input.to}`,
    comparison: null,
  };
}

export function resolveAnalyticsPeriod(
  input: AnalyticsPeriodInput,
  options: {
    timezone?: string | null;
    businessCreatedAt: Date;
    clock?: Clock;
  },
): ResolvedAnalyticsPeriod {
  const timezone = options.timezone || DEFAULT_BUSINESS_TIMEZONE;
  const now = DateTime.fromJSDate((options.clock ?? (() => new Date()))(), {
    zone: "utc",
  }).setZone(timezone);

  if (input.mode === "rolling") {
    return resolveRolling(input, timezone, options.businessCreatedAt, now);
  }
  if (input.mode === "completed") {
    return resolveCompleted(input, timezone, now);
  }
  return resolveCustom(input, timezone);
}

export function periodCacheKey(period: AnalyticsPeriodInput): string {
  switch (period.mode) {
    case "rolling":
      return `rolling:${period.preset}`;
    case "completed":
      return `completed:${period.unit}:${period.count}`;
    case "custom":
      return `custom:${period.from}:${period.to}`;
  }
}
