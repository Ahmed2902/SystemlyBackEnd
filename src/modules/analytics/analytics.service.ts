import { DateTime } from "luxon";
import redis from "../../shared/config/redis";
import { prisma } from "../../shared/db/prisma";
import { Errors } from "../../shared/errors/application-error";
import {
  calculateChange,
  calculateRate,
  calculateWeightedRate,
  roundPercentage,
} from "./comparisons";
import {
  periodCacheKey,
  resolveAnalyticsPeriod,
  type AnalyticsPeriodInput,
  type ResolvedAnalyticsPeriod,
} from "./periods";
import * as customerQueries from "./queries/customer.queries";
import * as growthQueries from "./queries/growth.queries";
import * as operationsQueries from "./queries/operations.queries";
import * as revenueQueries from "./queries/revenue.queries";
import * as staffQueries from "./queries/staff.queries";
import * as summaryQueries from "./queries/summary.queries";

const CACHE_TTL_SECONDS = 120;
const DEFAULT_LAPSED_DAYS = 45;
const BUSINESS_META_TTL_MS = 5 * 60_000;
const MAX_BUSINESS_META_ENTRIES = 250;
const MAX_ANALYTICS_IN_FLIGHT = 250;

interface BusinessMeta {
  id: string;
  name: string;
  createdAt: Date;
  timezone: string;
}

type BusinessMetaEntry = { value: BusinessMeta; expiresAt: number };

const businessMetaCache = new Map<string, BusinessMetaEntry>();
const businessMetaInFlight = new Map<string, Promise<BusinessMeta>>();
const analyticsInFlight = new Map<string, Promise<unknown>>();
const analyticsQueryInFlight = new Map<string, Promise<unknown>>();

function sum<T>(rows: readonly T[], getter: (row: T) => number): number {
  return rows.reduce((total, row) => total + getter(row), 0);
}

function evictOldest<T>(cache: Map<string, T>, maximum: number) {
  if (cache.size < maximum) return;
  const oldestKey = cache.keys().next().value as string | undefined;
  if (oldestKey) cache.delete(oldestKey);
}

async function loadBusiness(businessId: string): Promise<BusinessMeta> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, createdAt: true, timezone: true },
  });
  if (!business) throw Errors.notFound("Business not found");
  return business;
}

async function resolveBusiness(businessId: string): Promise<BusinessMeta> {
  const cached = businessMetaCache.get(businessId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) businessMetaCache.delete(businessId);

  const existing = businessMetaInFlight.get(businessId);
  if (existing) return existing;

  const loading = loadBusiness(businessId)
    .then((value) => {
      if (!businessMetaCache.has(businessId)) {
        evictOldest(businessMetaCache, MAX_BUSINESS_META_ENTRIES);
      }
      businessMetaCache.set(businessId, {
        value,
        expiresAt: Date.now() + BUSINESS_META_TTL_MS,
      });
      return value;
    })
    .finally(() => businessMetaInFlight.delete(businessId));

  businessMetaInFlight.set(businessId, loading);
  return loading;
}

async function analyticsCacheVersion(businessId: string): Promise<string> {
  try {
    return (await redis.get(`analytics:version:${businessId}`)) ?? "0";
  } catch {
    return "0";
  }
}

export async function invalidateAnalyticsCache(
  businessId: string,
): Promise<void> {
  try {
    await redis.increment(`analytics:version:${businessId}`);
  } catch {
    // Analytics caching is an optimization; invalidation failure must not
    // invalidate the underlying transactional command.
  }
}

async function getCacheKey(
  businessId: string,
  domain: string,
  input: AnalyticsPeriodInput,
) {
  const version = await analyticsCacheVersion(businessId);
  return `analytics:v${version}:${businessId}:${domain}:${periodCacheKey(input)}`;
}

async function readCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    return null;
  }
}

async function writeCached<T>(key: string, value: T): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), CACHE_TTL_SECONDS);
  } catch {
    // Redis is a fail-open optimization.
  }
}

async function withCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cached = await readCached<T>(key);
  if (cached) return cached;

  const existing = analyticsInFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  if (analyticsInFlight.size >= MAX_ANALYTICS_IN_FLIGHT) {
    const value = await loader();
    await writeCached(key, value);
    return value;
  }

  const loading = loader()
    .then(async (value) => {
      await writeCached(key, value);
      return value;
    })
    .finally(() => analyticsInFlight.delete(key));
  analyticsInFlight.set(key, loading);
  return loading;
}

function coalesceAnalyticsQuery<T>(key: string, loader: () => Promise<T>) {
  const existing = analyticsQueryInFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const loading = loader().finally(() => analyticsQueryInFlight.delete(key));
  analyticsQueryInFlight.set(key, loading);
  return loading;
}

function resolvedPeriod(business: BusinessMeta, input: AnalyticsPeriodInput) {
  return resolveAnalyticsPeriod(input, {
    businessCreatedAt: business.createdAt,
    timezone: business.timezone,
  });
}

function metadata(period: ResolvedAnalyticsPeriod) {
  return {
    period: {
      mode: period.mode,
      input: period.input,
      label: period.label,
      from: period.from,
      toExclusive: period.toExclusive,
      granularity: period.granularity,
      isComplete: period.isComplete,
    },
    comparisonPeriod: period.comparison,
    // Backward-compatible range shape for the existing frontend during the
    // selector migration. `to` now has explicit exclusive semantics.
    range: {
      from: period.from,
      to: period.toExclusive,
      toExclusive: period.toExclusive,
      granularity: period.granularity,
    },
    timezone: period.timezone,
    generatedAt: new Date().toISOString(),
  };
}

function getRevenueTrend(
  businessId: string,
  period: Pick<ResolvedAnalyticsPeriod, "from" | "toExclusive" | "granularity" | "timezone">,
) {
  const key = `revenue-trend:${businessId}:${period.from.toISOString()}:${period.toExclusive.toISOString()}:${period.granularity}:${period.timezone}`;
  return coalesceAnalyticsQuery(key, () =>
    revenueQueries.getRevenueTrend(
      businessId,
      period.from,
      period.toExclusive,
      period.granularity,
      period.timezone,
    ),
  );
}

function getAcquisitionSources(businessId: string) {
  return coalesceAnalyticsQuery(`acquisition:${businessId}`, () =>
    customerQueries.getAcquisitionSources(businessId),
  );
}

function getRetentionCohorts(businessId: string, timezone: string) {
  return coalesceAnalyticsQuery(`retention:${businessId}:${timezone}`, () =>
    customerQueries.computeRetentionCohorts(businessId, timezone),
  );
}

async function revenueTotals(
  businessId: string,
  boundary: { from: Date; toExclusive: Date },
  timezone: string,
) {
  const [trend, customItems] = await Promise.all([
    revenueQueries.getRevenueTrend(
      businessId,
      boundary.from,
      boundary.toExclusive,
      "month",
      timezone,
    ),
    summaryQueries.getCustomItemRevenue(
      businessId,
      boundary.from,
      boundary.toExclusive,
    ),
  ]);
  const revenueCents = sum(trend, (row) => row.totalCents);
  const paidInvoiceCount = sum(trend, (row) => row.invoiceCount);
  return {
    revenueCents,
    paidInvoiceCount,
    averageInvoiceCents:
      paidInvoiceCount > 0 ? Math.round(revenueCents / paidInvoiceCount) : 0,
    customItemRevenueCents: sum(customItems, (row) => row.totalCents),
  };
}

function revenueComparisons(
  current: Awaited<ReturnType<typeof revenueTotals>>,
  previous: Awaited<ReturnType<typeof revenueTotals>> | null,
) {
  if (!previous) return null;
  return {
    revenue: calculateChange(current.revenueCents, previous.revenueCents),
    paidInvoices: calculateChange(
      current.paidInvoiceCount,
      previous.paidInvoiceCount,
    ),
    averageInvoice: calculateChange(
      current.averageInvoiceCents,
      previous.averageInvoiceCents,
    ),
    customItemRevenue: calculateChange(
      current.customItemRevenueCents,
      previous.customItemRevenueCents,
    ),
  };
}

function retentionRate(
  rows: customerQueries.RetentionCohortRow[],
  field: "retained30" | "retained60" | "retained90",
  days: number,
  timezone: string,
) {
  const cutoff = DateTime.now().setZone(timezone).minus({ days });
  const mature = rows.filter(
    (row) =>
      DateTime.fromJSDate(row.cohortStart)
        .setZone(timezone)
        .endOf("month") <= cutoff,
  );
  const total = sum(mature, (row) => row.totalCustomers);
  if (!total) return null;
  return roundPercentage((sum(mature, (row) => row[field]) / total) * 100);
}

class AnalyticsService {
  async getRevenueAnalytics(
    businessId: string,
    input: AnalyticsPeriodInput,
  ) {
    const key = await getCacheKey(businessId, "revenue", input);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId);
      const period = resolvedPeriod(business, input);
      const [trend, byCategory, byWeekday, customItems, currentTotals, previousTotals] =
        await Promise.all([
          getRevenueTrend(businessId, period),
          revenueQueries.getRevenueByCategory(
            businessId,
            period.from,
            period.toExclusive,
          ),
          revenueQueries.getRevenueByWeekday(
            businessId,
            period.from,
            period.toExclusive,
            period.timezone,
          ),
          summaryQueries.getCustomItemRevenue(
            businessId,
            period.from,
            period.toExclusive,
          ),
          revenueTotals(businessId, period, period.timezone),
          period.comparison
            ? revenueTotals(businessId, period.comparison, period.timezone)
            : Promise.resolve(null),
        ]);

      const averageInvoiceValueTrend = trend.map((row) => ({
        bucket: row.bucket,
        averageCents:
          row.invoiceCount > 0
            ? Math.round(row.totalCents / row.invoiceCount)
            : null,
        invoiceCount: row.invoiceCount,
      }));
      const topCategory = byCategory[0]
        ? {
            category: byCategory[0].category,
            totalCents: byCategory[0].totalCents,
          }
        : null;
      const bestWeekdayRow = [...byWeekday].sort(
        (left, right) => right.totalCents - left.totalCents,
      )[0];

      return {
        ...metadata(period),
        comparison: revenueComparisons(currentTotals, previousTotals),
        summary: {
          ...currentTotals,
          customItemQuantity: sum(customItems, (row) => row.quantity),
          topCategory,
          bestWeekday: bestWeekdayRow
            ? {
                weekday: bestWeekdayRow.weekday,
                totalCents: bestWeekdayRow.totalCents,
              }
            : null,
        },
        trend,
        byCategory,
        byWeekday,
        customItems,
        averageInvoiceValue: {
          averageCents: currentTotals.averageInvoiceCents,
          invoiceCount: currentTotals.paidInvoiceCount,
        },
        averageInvoiceValueTrend,
      };
    });
  }

  async getCustomerAnalytics(
    businessId: string,
    input: AnalyticsPeriodInput,
  ) {
    const key = await getCacheKey(businessId, "customers", input);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId);
      const period = resolvedPeriod(business, input);
      const lapsedThreshold = DateTime.now()
        .setZone(period.timezone)
        .minus({ days: DEFAULT_LAPSED_DAYS })
        .toUTC()
        .toJSDate();

      const [
        rangeSummary,
        previousRangeSummary,
        newVsReturning,
        lifetimeValue,
        lifetimeValueAllTime,
        acquisitionSources,
        lapsedItems,
        lapsedTotal,
        retentionCohorts,
        cancellationRate,
      ] = await Promise.all([
        summaryQueries.getCustomerRangeSummary(
          businessId,
          period.from,
          period.toExclusive,
        ),
        period.comparison
          ? summaryQueries.getCustomerRangeSummary(
              businessId,
              period.comparison.from,
              period.comparison.toExclusive,
            )
          : Promise.resolve(null),
        customerQueries.getNewVsReturningCustomers(
          businessId,
          period.from,
          period.toExclusive,
          period.granularity,
          period.timezone,
        ),
        customerQueries.getCustomerLifetimeValue(
          businessId,
          period.from,
          period.toExclusive,
        ),
        customerQueries.getCustomerLifetimeValue(businessId),
        getAcquisitionSources(businessId),
        customerQueries.getLapsedCustomers(
          businessId,
          lapsedThreshold,
          10,
          period.timezone,
        ),
        prisma.customer.count({
          where: { businessId, lastVisitAt: { lte: lapsedThreshold } },
        }),
        getRetentionCohorts(businessId, period.timezone),
        customerQueries.getCancellationRateOverTime(
          businessId,
          period.from,
          period.toExclusive,
          period.granularity,
          period.timezone,
        ),
      ]);

      const noShowRate = cancellationRate.map((row) => ({
        bucket: row.bucket,
        noShowCount: row.noShowCount,
        completedCount: row.completedCount,
        rate: calculateRate(
          row.noShowCount,
          row.completedCount + row.noShowCount,
        ),
      }));
      const completedCount = sum(cancellationRate, (row) => row.completedCount);
      const noShowCount = sum(cancellationRate, (row) => row.noShowCount);
      const cancellationCount = sum(
        cancellationRate,
        (row) => row.totalCancelled,
      );
      const appointmentOutcomeCount =
        completedCount + noShowCount + cancellationCount;

      return {
        ...metadata(period),
        comparison: previousRangeSummary
          ? {
              activeCustomers: calculateChange(
                rangeSummary.activeCustomers,
                previousRangeSummary.activeCustomers,
              ),
              newCustomers: calculateChange(
                rangeSummary.newCustomers,
                previousRangeSummary.newCustomers,
              ),
              returningCustomers: calculateChange(
                rangeSummary.returningCustomers,
                previousRangeSummary.returningCustomers,
              ),
            }
          : null,
        summary: {
          ...rangeSummary,
          lapsedCustomerCount: lapsedTotal,
          noShowRate: calculateRate(
            noShowCount,
            completedCount + noShowCount,
          ),
          noShowCount,
          completedCount,
          cancellationRate: calculateRate(
            cancellationCount,
            appointmentOutcomeCount,
          ),
          cancellationCount,
          appointmentOutcomeCount,
          rateDefinitions: {
            noShow: "no_show / (completed + no_show)",
            cancellation:
              "cancelled / (cancelled + completed + no_show)",
          },
        },
        retentionSummary: {
          day30Rate: retentionRate(
            retentionCohorts,
            "retained30",
            30,
            period.timezone,
          ),
          day60Rate: retentionRate(
            retentionCohorts,
            "retained60",
            60,
            period.timezone,
          ),
          day90Rate: retentionRate(
            retentionCohorts,
            "retained90",
            90,
            period.timezone,
          ),
        },
        newVsReturning,
        lifetimeValue,
        lifetimeValueAllTime,
        acquisitionSources,
        lapsedCustomers: {
          total: lapsedTotal,
          thresholdDays: DEFAULT_LAPSED_DAYS,
          items: lapsedItems,
        },
        retentionCohorts,
        noShowRate,
        cancellationRate,
      };
    });
  }

  async getStaffAnalytics(businessId: string, input: AnalyticsPeriodInput) {
    const key = await getCacheKey(businessId, "staff", input);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId);
      const period = resolvedPeriod(business, input);
      const [revenueGenerated, utilization, previousRevenue] = await Promise.all([
        staffQueries.getStaffRevenue(
          businessId,
          period.from,
          period.toExclusive,
        ),
        staffQueries.computeStaffUtilization(
          businessId,
          period.from,
          period.toExclusive,
          period.timezone,
        ),
        period.comparison
          ? staffQueries.getStaffRevenue(
              businessId,
              period.comparison.from,
              period.comparison.toExclusive,
            )
          : Promise.resolve(null),
      ]);
      const revenueById = new Map(
        revenueGenerated.map((row) => [row.id, row]),
      );
      const utilizationById = new Map(
        utilization.map((row) => [row.id, row]),
      );
      const ids = new Set([
        ...revenueById.keys(),
        ...utilizationById.keys(),
      ]);
      const staffPerformance = [...ids]
        .map((id) => {
          const revenue = revenueById.get(id);
          const time = utilizationById.get(id);
          const availableMinutes = time?.availableMinutes ?? 0;
          const bookedMinutes = time?.bookedMinutes ?? 0;
          return {
            id,
            name: revenue?.name ?? time?.name ?? "Unknown staff",
            totalCents: revenue?.totalCents ?? 0,
            commissionEarnedCents: revenue?.commissionEarnedCents ?? 0,
            lineItemCount: revenue?.lineItemCount ?? 0,
            bookedMinutes,
            availableMinutes,
            utilizationRate: calculateRate(bookedMinutes, availableMinutes),
          };
        })
        .sort((left, right) => right.totalCents - left.totalCents);
      const revenueCents = sum(staffPerformance, (row) => row.totalCents);
      const previousRevenueCents = previousRevenue
        ? sum(previousRevenue, (row) => row.totalCents)
        : null;

      return {
        ...metadata(period),
        comparison:
          previousRevenueCents === null
            ? null
            : {
                revenue: calculateChange(revenueCents, previousRevenueCents),
              },
        summary: {
          revenueCents,
          commissionCents: sum(
            staffPerformance,
            (row) => row.commissionEarnedCents,
          ),
          averageUtilizationRate: calculateWeightedRate(
            staffPerformance.map((row) => ({
              numerator: row.bookedMinutes,
              denominator: row.availableMinutes,
            })),
          ),
          lowUtilizationCount: staffPerformance.filter(
            (row) => row.utilizationRate < 40,
          ).length,
        },
        staffPerformance,
      };
    });
  }

  async getOperationsAnalytics(
    businessId: string,
    input: AnalyticsPeriodInput,
  ) {
    const key = await getCacheKey(businessId, "operations", input);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId);
      const period = resolvedPeriod(business, input);
      const [heatmap, mostBookedServices, leadTimes, previousHeatmap] =
        await Promise.all([
          operationsQueries.getBookingHeatmap(
            businessId,
            period.from,
            period.toExclusive,
            period.timezone,
          ),
          operationsQueries.getMostBookedServices(
            businessId,
            period.from,
            period.toExclusive,
          ),
          operationsQueries.computeBookingLeadTimes(
            businessId,
            period.from,
            period.toExclusive,
            period.timezone,
          ),
          period.comparison
            ? operationsQueries.getBookingHeatmap(
                businessId,
                period.comparison.from,
                period.comparison.toExclusive,
                period.timezone,
              )
            : Promise.resolve(null),
        ]);
      const busiest =
        [...heatmap].sort((left, right) => right.count - left.count)[0] ?? null;
      const bookingCount = sum(heatmap, (row) => row.count);
      return {
        ...metadata(period),
        comparison: previousHeatmap
          ? {
              bookingCount: calculateChange(
                bookingCount,
                sum(previousHeatmap, (row) => row.count),
              ),
            }
          : null,
        summary: {
          bookingCount,
          busiestWeekday: busiest?.weekday ?? null,
          busiestHour: busiest?.hour ?? null,
          mostBookedService: mostBookedServices[0] ?? null,
        },
        heatmap,
        mostBookedServices,
        leadTimes,
      };
    });
  }

  async getGrowthAnalytics(businessId: string, input: AnalyticsPeriodInput) {
    const key = await getCacheKey(businessId, "growth", input);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId);
      const period = resolvedPeriod(business, input);
      const [trend, currentTotals, previousTotals, acquisitionSources, retentionCohorts] =
        await Promise.all([
          getRevenueTrend(businessId, period),
          revenueTotals(businessId, period, period.timezone),
          period.comparison
            ? revenueTotals(businessId, period.comparison, period.timezone)
            : Promise.resolve(null),
          getAcquisitionSources(businessId),
          getRetentionCohorts(businessId, period.timezone),
        ]);

      const bucketGrowth =
        period.mode === "completed"
          ? growthQueries.computePeriodOverPeriodGrowth(trend)
          : [];
      const bestGrowthPeriod =
        bucketGrowth
          .filter((row) => row.growthPct !== null)
          .sort(
            (left, right) =>
              (right.growthPct ?? 0) - (left.growthPct ?? 0),
          )[0] ?? null;
      const comparison = previousTotals
        ? calculateChange(
            currentTotals.revenueCents,
            previousTotals.revenueCents,
          )
        : null;

      return {
        ...metadata(period),
        summary: {
          currentPeriodRevenueCents: currentTotals.revenueCents,
          previousPeriodRevenueCents: previousTotals?.revenueCents ?? null,
          periodGrowthPct: comparison?.percentageChange ?? null,
          periodComparisonState: comparison?.comparisonState ?? null,
          bestGrowthPeriod,
          // Compatibility fields until the frontend period selector lands.
          currentMonthRevenueCents: currentTotals.revenueCents,
          previousMonthRevenueCents: previousTotals?.revenueCents ?? 0,
          monthOverMonthGrowthPct: comparison?.percentageChange ?? null,
          bestGrowthMonth: bestGrowthPeriod,
        },
        comparison,
        trend,
        bucketGrowth,
        monthlyGrowth: bucketGrowth,
        acquisitionSources,
        retentionCohorts,
      };
    });
  }

  async getDashboardOverview(
    businessId: string,
    input: AnalyticsPeriodInput,
  ) {
    const business = await resolveBusiness(businessId);
    const [revenue, customers, staff, operations, growth] = await Promise.all([
      this.getRevenueAnalytics(businessId, input),
      this.getCustomerAnalytics(businessId, input),
      this.getStaffAnalytics(businessId, input),
      this.getOperationsAnalytics(businessId, input),
      this.getGrowthAnalytics(businessId, input),
    ]);
    return {
      businessId: business.id,
      businessName: business.name,
      timezone: business.timezone,
      generatedAt: new Date().toISOString(),
      revenue,
      customers,
      staff,
      operations,
      growth,
    };
  }
}

export default new AnalyticsService();
