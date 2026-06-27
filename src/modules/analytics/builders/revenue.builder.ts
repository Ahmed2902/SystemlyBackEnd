import { DateTime } from "luxon";
import type {
  AnalyticsDashboardContext,
  RevenueSection,
  AnalyticsTrendPoint,
  RevenueByCategoryPoint,
  RevenueByWeekdayPoint,
  MonthGrowthPoint,
} from "../analytics.types";
import { createBucketSeries, formatBucketKey } from "../utils/date-buckets";
import {
  growthRate,
  roundCents,
  toNumber,
  formatDayName,
  normalizeSource,
} from "../utils/analytics.helpers";

const toTrendPoints = (
  ctx: AnalyticsDashboardContext,
  rows: { bucketStart: Date; totalCents: number; count: number }[],
): AnalyticsTrendPoint[] => {
  const buckets = createBucketSeries(
    ctx.range.from,
    ctx.range.to,
    ctx.business.timezone,
    ctx.range.granularity,
  );
  const byKey = new Map(
    rows.map((row) => [
      formatBucketKey(
        DateTime.fromJSDate(row.bucketStart, { zone: "utc" }).setZone(
          ctx.business.timezone,
        ),
        ctx.range.granularity,
      ),
      row,
    ]),
  );

  return buckets.map((bucket) => {
    const row = byKey.get(bucket.key);
    const totalCents = roundCents(row?.totalCents ?? 0);
    const count = toNumber(row?.count, 0);
    return {
      ...bucket,
      totalCents,
      count,
      averageInvoiceValueCents: count > 0 ? Math.round(totalCents / count) : 0,
    };
  });
};

const toRevenueByCategory = (
  rows: { category: string | null; totalCents: number; count: number }[],
): RevenueByCategoryPoint[] => {
  return rows
    .map((row) => ({
      category: normalizeSource(row.category),
      totalCents: roundCents(row.totalCents),
      count: toNumber(row.count, 0),
    }))
    .sort((left, right) => right.totalCents - left.totalCents);
};

const toRevenueByWeekday = (
  rows: { weekday: number; totalCents: number; count: number }[],
): RevenueByWeekdayPoint[] => {
  return rows
    .map((row) => ({
      weekday: row.weekday,
      label: formatDayName(row.weekday),
      totalCents: roundCents(row.totalCents),
      count: toNumber(row.count, 0),
    }))
    .sort((left, right) => left.weekday - right.weekday);
};

const toMonthGrowth = (
  rows: { monthStart: Date; totalCents: number; count: number }[],
  timezone: string,
): MonthGrowthPoint[] => {
  const monthly = rows
    .map((row) => ({
      monthStart: row.monthStart,
      revenueCents: roundCents(row.totalCents),
      count: toNumber(row.count, 0),
    }))
    .sort(
      (left, right) => left.monthStart.getTime() - right.monthStart.getTime(),
    );

  return monthly.map((row, index) => {
    const previous = monthly[index - 1]?.revenueCents ?? 0;
    const local = DateTime.fromJSDate(row.monthStart, { zone: "utc" }).setZone(
      timezone,
    );
    return {
      key: local.toFormat("yyyy-LL"),
      label: local.toFormat("LLLL yyyy"),
      revenueCents: row.revenueCents,
      previousRevenueCents: previous,
      growthRate: growthRate(row.revenueCents, previous),
    };
  });
};

export const buildRevenueAnalytics = (
  ctx: AnalyticsDashboardContext,
): RevenueSection => {
  const revenueTrend = toTrendPoints(ctx, ctx.revenue.trend);
  const averageInvoiceValueTrend = revenueTrend.map((point) => ({ ...point }));

  return {
    revenueTrend,
    revenueByCategory: toRevenueByCategory(ctx.revenue.byCategory),
    revenueByWeekday: toRevenueByWeekday(ctx.revenue.byWeekday),
    averageInvoiceValueTrend,
    monthOverMonthGrowth: toMonthGrowth(
      ctx.revenue.monthlyGrowth,
      ctx.business.timezone,
    ),
  };
};

export default buildRevenueAnalytics;
