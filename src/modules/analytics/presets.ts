import {
  DEFAULT_BUSINESS_TIMEZONE,
  LEGACY_PRESET_ALIASES,
  ROLLING_PRESETS,
  resolveAnalyticsPeriod,
  type Granularity,
  type LegacyAnalyticsPreset,
  type RollingPreset,
} from "./periods";

export const BUSINESS_TIMEZONE = DEFAULT_BUSINESS_TIMEZONE;
export const ANALYTICS_PRESETS = [
  ...ROLLING_PRESETS,
  ...Object.keys(LEGACY_PRESET_ALIASES),
] as const;

export type AnalyticsPreset = RollingPreset | LegacyAnalyticsPreset;
export type { Granularity };

/**
 * Compatibility wrapper for existing callers while the analytics API moves to
 * explicit rolling/completed/custom period inputs.
 */
export function resolveRange(
  preset: AnalyticsPreset,
  businessCreatedAt: Date,
  timezone = DEFAULT_BUSINESS_TIMEZONE,
) {
  const normalized =
    preset in LEGACY_PRESET_ALIASES
      ? LEGACY_PRESET_ALIASES[preset as LegacyAnalyticsPreset]
      : (preset as RollingPreset);
  const period = resolveAnalyticsPeriod(
    { mode: "rolling", preset: normalized },
    { businessCreatedAt, timezone },
  );

  return {
    from: period.from,
    to: period.toExclusive,
    toExclusive: period.toExclusive,
    granularity: period.granularity,
  };
}
