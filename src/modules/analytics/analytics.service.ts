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

function scopeKey(branchId?: string) {
  return branchId ?? "all";
}

function businessMetaKey(businessId: string, branchId?: string) {
  return `${businessId}:${scopeKey(branchId)}`;
}

function evictOldest<T>(cache: Map<string, T>, maximum: number) {
  if (cache.size < maximum) return;
  const oldestKey = cache.keys().next().value as string | undefined;
  if (oldestKey) cache.delete(oldestKey);
}

async function loadBusiness(
  businessId: string,
  branchId?: string,
): Promise<BusinessMeta> {
  const [business, branch] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, createdAt: true, timezone: true },
    }),
    branchId
      ? prisma.branch.findFirst({
          where: { id: branchId, businessId, isActive: true },
          select: { timezone: true },
        })
      : Promise.resolve(null),
  ]);
  if (!business) throw Errors.notFound("Business not found");
  if (branchId && !branch) throw Errors.notFound("Branch not found");
  return {
    ...business,
    timezone: branch?.timezone || business.timezone,
  };
}

async function resolveBusiness(
  businessId: string,
  branchId?: string,
): Promise<BusinessMeta> {
  const key = businessMetaKey(businessId, branchId);
  const cached = businessMetaCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) businessMetaCache.delete(key);

  const existing = businessMetaInFlight.get(key);
  if (existing) return existing;

  const loading = loadBusiness(businessId, branchId)
    .then((value) => {
      if (!businessMetaCache.has(key)) {
        evictOldest(businessMetaCache, MAX_BUSINESS_META_ENTRIES);
      }
      businessMetaCache.set(key, {
        value,
        expiresAt: Date.now() + BUSINESS_META_TTL_MS,
      });
      return value;
    })
    .finally(() => businessMetaInFlight.delete(key));

  businessMetaInFlight.set(key, loading);
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
  branchId?: string,
) {
  const version = await analyticsCacheVersion(businessId);
  return `analytics:v${version}:${businessId}:${scopeKey(branchId)}:${domain}:${periodCacheKey(input)}`;
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

function metadata(period: ResolvedAnalyticsPeriod, branchId?: string) {
  return {
    scope: {
      mode: branchId ? ("branch" as const) : ("all" as const),
      branchId: branchId ?? null,
    },
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
  period: Pick<
    ResolvedAnalyticsPeriod,
    "from" | "toExclusive" | "granularity" | "timezone"
  >,
  branchId?: string,
) {
  const key = `revenue-trend:${businessId}:${scopeKey(branchId)}:${period.from.toISOString()}:${period.toExclusive.toISOString()}:${period.granularity}:${period.timezone}`;
  return coalesceAnalyticsQuery(key, () =>
    revenueQueries.getRevenueTrend(
      businessId,
      period.from,
      period.toExclusive,
      period.granularity,
      period.timezone,
      branchId,
    ),
  );
}

function getAcquisitionSources(businessId: string, branchId?: string) {
  return coalesceAnalyticsQuery(
    `acquisition:${businessId}:${scopeKey(branchId)}`,
    () => customerQueries.getAcquisitionSources(businessId, branchId),
  );
}

function getRetentionCohorts(
  businessId: string,
  timezone: string,
  branchId?: string,
) {
  return coalesceAnalyticsQuery(
    `retention:${businessId}:${scopeKey(branchId)}:${timezone}`,
    () => customerQueries.computeRetentionCohorts(businessId, timezone, branchId),
  );
}

async function revenueTotals(
  businessId: string,
  boundary: { from: Date; toExclusive: Date },
  timezone: string,
  branchId?: string,
) {
  const [trend, customItems] = await Promise.all([
    revenueQueries.getRevenueTrend(
      businessId,
      boundary.from,
      boundary.toExclusive,
      "month",
      timezone,
      branchId,
    ),
    summaryQueries.getCustomItemRevenue(
      businessId,
      boundary.from,
      boundary.toExclusive,
      12,
      branchId,
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
    branchId?: string,
  ) {
    const key = await getCacheKey(businessId, "revenue", input, branchId);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId, branchId);
      const period = resolvedPeriod(business, input);
      const [
        trend,
        byCategory,
        byWeekday,
        customItems,
        currentTotals,
        previousTotals,
      ] = await Promise.all([
        getRevenueTrend(businessId, period, branchId),
        revenueQueries.getRevenueByCategory(
          businessId,
          period.from,
          period.toExclusive,
          branchId,
        ),
        revenueQueries.getRevenueByWeekday(
          businessId,
          period.from,
          period.toExclusive,
          period.timezone,
          branchId,
        ),
        summaryQueries.getCustomItemRevenue(
          businessId,
          period.from,
          period.toExclusive,
          12,
          branchId,
        ),
        revenueTotals(businessId, period, period.timezone, branchId),
        period.comparison
          ? revenueTotals(
              businessId,
              period.comparison,
              period.timezone,
              branchId,
            )
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
        ...metadata(period, branchId),
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
    branchId?: string,
  ) {
    const key = await getCacheKey(businessId, "customers", input, branchId);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId, branchId);
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
          branchId,
        ),
        period.comparison
          ? summaryQueries.getCustomerRangeSummary(
              businessId,
              period.comparison.from,
              period.comparison.toExclusive,
              branchId,
            )
          : Promise.resolve(null),
        customerQueries.getNewVsReturningCustomers(
          businessId,
          period.from,
          period.toExclusive,
          period.granularity,
          period.timezone,
          branchId,
        ),
        customerQueries.getCustomerLifetimeValue(
          businessId,
          period.from,
          period.toExclusive,
          20,
          branchId,
        ),
        customerQueries.getCustomerLifetimeValue(
          businessId,
          undefined,
          undefined,
          20,
          branchId,
        ),
        getAcquisitionSources(businessId, branchId),
        customerQueries.getLapsedCustomers(
          businessId,
          lapsedThreshold,
          10,
          period.timezone,
          branchId,
        ),
        customerQueries.countLapsedCustomers(
          businessId,
          lapsedThreshold,
          branchId,
        ),
        getRetentionCohorts(businessId, period.timezone, branchId),
        customerQueries.getCancellationRateOverTime(
          businessId,
          period.from,
          period.toExclusive,
          period.granularity,
          period.timezone,
          branchId,
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
        ...metadata(period, branchId),
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

  async getStaffAnalytics(
    businessId: string,
    input: AnalyticsPeriodInput,
    branchId?: string,
  ) {
    const key = await getCacheKey(businessId, "staff", input, branchId);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId, branchId);
      const period = resolvedPeriod(business, input);
      const [revenueGenerated, utilization, previousRevenue] = await Promise.all([
        staffQueries.getStaffRevenue(
          businessId,
          period.from,
          period.toExclusive,
          branchId,
        ),
        staffQueries.computeStaffUtilization(
          businessId,
          period.from,
          period.toExclusive,
          period.timezone,
          branchId,
        ),
        period.comparison
          ? staffQueries.getStaffRevenue(
              businessId,
              period.comparison.from,
              period.comparison.toExclusive,
              branchId,
            )
          : Promise.resolve(null),
      ]);
      const revenueById = new Map(
        revenueGenerated.map((row) => [row.id, row]),
      );
      const utilizationById = new Map(
        utilization.map((row) => [row.id, row]),
      );
      const ids = new Set([...revenueById.keys(), ...utilizationById.keys()]);
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
        ...metadata(period, branchId),
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
    branchId?: string,
  ) {
    const key = await getCacheKey(businessId, "operations", input, branchId);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId, branchId);
      const period = resolvedPeriod(business, input);
      const [heatmap, mostBookedServices, leadTimes, previousHeatmap] =
        await Promise.all([
          operationsQueries.getBookingHeatmap(
            businessId,
            period.from,
            period.toExclusive,
            period.timezone,
            branchId,
          ),
          operationsQueries.getMostBookedServices(
            businessId,
            period.from,
            period.toExclusive,
            10,
            branchId,
          ),
          operationsQueries.computeBookingLeadTimes(
            businessId,
            period.from,
            period.toExclusive,
            period.timezone,
            branchId,
          ),
          period.comparison
            ? operationsQueries.getBookingHeatmap(
                businessId,
                period.comparison.from,
                period.comparison.toExclusive,
                period.timezone,
                branchId,
              )
            : Promise.resolve(null),
        ]);
      const busiest =
        [...heatmap].sort((left, right) => right.count - left.count)[0] ?? null;
      const bookingCount = sum(heatmap, (row) => row.count);
      return {
        ...metadata(period, branchId),
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

  async getGrowthAnalytics(
    businessId: string,
    input: AnalyticsPeriodInput,
    branchId?: string,
  ) {
    const key = await getCacheKey(businessId, "growth", input, branchId);
    return withCache(key, async () => {
      const business = await resolveBusiness(businessId, branchId);
      const period = resolvedPeriod(business, input);
      const [
        trend,
        currentTotals,
        previousTotals,
        acquisitionSources,
        retentionCohorts,
      ] = await Promise.all([
        getRevenueTrend(businessId, period, branchId),
        revenueTotals(businessId, period, period.timezone, branchId),
        period.comparison
          ? revenueTotals(
              businessId,
              period.comparison,
              period.timezone,
              branchId,
            )
          : Promise.resolve(null),
        getAcquisitionSources(businessId, branchId),
        getRetentionCohorts(businessId, period.timezone, branchId),
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
        ...metadata(period, branchId),
        summary: {
          currentPeriodRevenueCents: currentTotals.revenueCents,
          previousPeriodRevenueCents: previousTotals?.revenueCents ?? null,
          periodGrowthPct: comparison?.percentageChange ?? null,
          periodComparisonState: comparison?.comparisonState ?? null,
          bestGrowthPeriod,
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
    branchId?: string,
  ) {
    const business = await resolveBusiness(businessId, branchId);
    const [revenue, customers, staff, operations, growth] = await Promise.all([
      this.getRevenueAnalytics(businessId, input, branchId),
      this.getCustomerAnalytics(businessId, input, branchId),
      this.getStaffAnalytics(businessId, input, branchId),
      this.getOperationsAnalytics(businessId, input, branchId),
      this.getGrowthAnalytics(businessId, input, branchId),
    ]);
    return {
      businessId: business.id,
      businessName: business.name,
      scope: {
        mode: branchId ? ("branch" as const) : ("all" as const),
        branchId: branchId ?? null,
      },
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
