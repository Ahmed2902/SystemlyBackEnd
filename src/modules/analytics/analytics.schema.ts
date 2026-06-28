import { z } from "zod";
import { ANALYTICS_PRESETS } from "./presets";

export const AnalyticsStatsQuerySchema = z.object({
  preset: z.enum(ANALYTICS_PRESETS).default("last_month"),
});

export type AnalyticsStatsQuery = z.infer<typeof AnalyticsStatsQuerySchema>;
