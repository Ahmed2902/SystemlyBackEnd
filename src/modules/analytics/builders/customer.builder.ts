import { DateTime } from "luxon";
import type {
  AnalyticsDashboardContext,
  CustomerSection,
  CustomerTrendPoint,
  LapsedCustomerPoint,
  MostFrequentCustomerPoint,
  RetentionCohortPoint,
  TopCustomerPoint,
} from "../analytics.types";
import { createBucketSeries, formatBucketKey } from "../utils/date-buckets";
import {
  normalizeSource,
  safeDateString,
  toNumber,
  growthRate,
} from "../utils/analytics.helpers";

const buildTrend = (ctx: AnalyticsDashboardContext): CustomerTrendPoint[] => {
  const buckets = createBucketSeries(
    ctx.range.from,
    ctx.range.to,
    ctx.business.timezone,
    ctx.range.granularity,
  );
  const byKey = new Map(
    ctx.customers.newVsReturning.map((row) => [
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
    return {
      key: bucket.key,
      label: bucket.label,
      newCustomers: toNumber(row?.newCustomers, 0),
      returningCustomers: toNumber(row?.returningCustomers, 0),
    };
  });
};

const toRetention = (
  ctx: AnalyticsDashboardContext,
): RetentionCohortPoint[] => {
  return ctx.customers.retentionCohorts.map((row) => {
    const local = DateTime.fromJSDate(row.cohortStart, { zone: "utc" }).setZone(
      ctx.business.timezone,
    );
    const total = Math.max(toNumber(row.totalCustomers, 0), 0);
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

export const buildCustomerAnalytics = (
  ctx: AnalyticsDashboardContext,
): CustomerSection => {
  const customerLifetimeValue: TopCustomerPoint[] =
    ctx.customers.lifetimeValue.map((row) => ({
      id: row.id,
      name: row.name,
      totalCents: toNumber(row.totalCents, 0),
      count: toNumber(row.count, 0),
    }));

  const mostFrequentCustomers: MostFrequentCustomerPoint[] =
    ctx.customers.mostFrequent.map((row) => ({
      id: row.id,
      name: row.name,
      visitCount: toNumber(row.visitCount, 0),
    }));

  return {
    customerLifetimeValue,
    mostFrequentCustomers,
    acquisitionSources: ctx.customers.acquisitionSources.map((row) => ({
      source: normalizeSource(row.source),
      count: toNumber(row.count, 0),
    })),
    newVsReturning: buildTrend(ctx),
    lapsedCustomers: ctx.customers.lapsedCustomers.map(
      (row): LapsedCustomerPoint => ({
        id: row.id,
        name: row.name,
        lastVisitAt: safeDateString(row.lastVisitAt),
        daysSinceLastVisit: toNumber(row.daysSinceLastVisit, 0),
      }),
    ),
    retentionCohorts: toRetention(ctx),
  };
};

export default buildCustomerAnalytics;
