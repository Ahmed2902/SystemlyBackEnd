import type {
  AnalyticsDashboardContext,
  GrowthSection,
  MonthGrowthPoint,
  RetentionCohortPoint,
} from "../analytics.types";
import {
  normalizeSource,
  toNumber,
  growthRate,
} from "../utils/analytics.helpers";
import { DateTime } from "luxon";

const toMonthGrowth = (ctx: AnalyticsDashboardContext): MonthGrowthPoint[] => {
  return ctx.growth.monthlyGrowth
    .map((row, index, rows) => {
      const local = DateTime.fromJSDate(row.monthStart, {
        zone: "utc",
      }).setZone(ctx.business.timezone);
      const revenueCents = toNumber(row.totalCents, 0);
      const previousRevenueCents =
        index > 0 ? toNumber(rows[index - 1]?.totalCents, 0) : 0;
      return {
        key: local.toFormat("yyyy-LL"),
        label: local.toFormat("LLLL yyyy"),
        revenueCents,
        previousRevenueCents,
        growthRate: growthRate(revenueCents, previousRevenueCents),
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
};

const toRetention = (
  ctx: AnalyticsDashboardContext,
): RetentionCohortPoint[] => {
  return ctx.growth.retentionCohorts.map((row) => {
    const local = DateTime.fromJSDate(row.cohortStart, { zone: "utc" }).setZone(
      ctx.business.timezone,
    );
    const total = toNumber(row.totalCustomers, 0);
    const retained30 = toNumber(row.retained30, 0);
    const retained60 = toNumber(row.retained60, 0);
    const retained90 = toNumber(row.retained90, 0);

    return {
      key: local.toFormat("yyyy-LL"),
      label: local.toFormat("LLLL yyyy"),
      totalCustomers: total,
      retained30,
      retained60,
      retained90,
      retention30Rate: growthRate(retained30, total) ?? 0,
      retention60Rate: growthRate(retained60, total) ?? 0,
      retention90Rate: growthRate(retained90, total) ?? 0,
    };
  });
};

export const buildGrowthAnalytics = (
  ctx: AnalyticsDashboardContext,
): GrowthSection => {
  return {
    monthOverMonthRevenueGrowth: toMonthGrowth(ctx),
    customerAcquisitionBySource: ctx.growth.acquisitionSources.map((row) => ({
      source: normalizeSource(row.source),
      count: toNumber(row.count, 0),
    })),
    retentionCohorts: toRetention(ctx),
  };
};

export default buildGrowthAnalytics;
