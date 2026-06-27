import type {
  AnalyticsDashboardContext,
  BookingHeatmapPoint,
  BookingLeadTimePoint,
  OperationsSection,
} from "../analytics.types";
import {
  formatRelativeBucket,
  normalizeSource,
  toNumber,
} from "../utils/analytics.helpers";

export const buildOperationsAnalytics = (
  ctx: AnalyticsDashboardContext,
): OperationsSection => {
  const bookingHeatmap: BookingHeatmapPoint[] = ctx.operations.heatmap.map(
    (row) => ({
      weekday: row.weekday,
      hour: row.hour,
      count: toNumber(row.count, 0),
    }),
  );

  const mostBookedServices = ctx.operations.mostBookedServices.map((row) => ({
    id: row.id,
    name: row.name,
    category: normalizeSource(row.category),
    count: toNumber(row.count, 0),
  }));

  const bookingLeadTimes: BookingLeadTimePoint[] = ctx.operations.leadTimes.map(
    (row) => ({
      bucket: row.bucket,
      label: formatRelativeBucket(row.bucket),
      count: toNumber(row.count, 0),
    }),
  );

  return {
    bookingHeatmap,
    mostBookedServices,
    bookingLeadTimes,
    serviceDurationAccuracy: {
      status: "not_available",
      reason:
        "Actual start/end timestamps are not captured yet, so accuracy cannot be measured.",
    },
  };
};

export default buildOperationsAnalytics;
