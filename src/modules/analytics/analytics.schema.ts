import { z } from "zod";
import {
  COMPLETED_PERIOD_COUNTS,
  LEGACY_PRESET_ALIASES,
  ROLLING_PRESETS,
  normalizeRollingPreset,
  type AnalyticsPeriodInput,
  type CompletedPeriodCount,
  type LegacyAnalyticsPreset,
  type RollingPreset,
} from "./periods";

const allPresetValues = [
  ...ROLLING_PRESETS,
  ...Object.keys(LEGACY_PRESET_ALIASES),
] as const;

const rawAnalyticsQuerySchema = z.object({
  mode: z.enum(["rolling", "completed", "custom"]).optional(),
  preset: z.enum(allPresetValues).optional(),
  unit: z.enum(["week", "month"]).optional(),
  count: z.coerce.number().int().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const AnalyticsStatsQuerySchema = rawAnalyticsQuerySchema.transform(
  (query, context): AnalyticsPeriodInput => {
    const inferredMode = query.mode ?? (query.from || query.to ? "custom" : "rolling");

    if (inferredMode === "rolling") {
      const preset = normalizeRollingPreset(
        (query.preset ?? "last_30_days") as
          | RollingPreset
          | LegacyAnalyticsPreset,
      );
      return { mode: "rolling", preset };
    }

    if (inferredMode === "completed") {
      const count = query.count ?? 3;
      if (!(COMPLETED_PERIOD_COUNTS as readonly number[]).includes(count)) {
        context.addIssue({
          code: "custom",
          path: ["count"],
          message: `Completed period count must be one of ${COMPLETED_PERIOD_COUNTS.join(
            ", ",
          )}.`,
        });
        return z.NEVER;
      }
      return {
        mode: "completed",
        unit: query.unit ?? "month",
        count: count as CompletedPeriodCount,
      };
    }

    if (!query.from || !query.to) {
      context.addIssue({
        code: "custom",
        path: [!query.from ? "from" : "to"],
        message: "Custom analytics require both from and to dates.",
      });
      return z.NEVER;
    }

    return { mode: "custom", from: query.from, to: query.to };
  },
);

export type AnalyticsStatsQuery = z.infer<typeof AnalyticsStatsQuerySchema>;
