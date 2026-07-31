import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import redis from "../../shared/config/redis";
import {
  resolveRange,
  BUSINESS_TIMEZONE,
  type AnalyticsPreset,
} from "./presets";
import * as revenueQueries from "./queries/revenue.queries";
import * as customerQueries from "./queries/customer.queries";
import * as summaryQueries from "./queries/summary.queries";
import * as staffQueries from "./queries/staff.queries";
import * as operationsQueries from "./queries/operations.queries";
import * as growthQueries from "./queries/growth.queries";

const CACHE_TTL_SECONDS = 120;
const CACHE_VERSION = "v5";
const DEFAULT_LAPSED_DAYS = 45;
const BUSINESS_META_TTL_MS = 5 * 60_000;
const MAX_BUSINESS_META_ENTRIES = 250;
const MAX_ANALYTICS_IN_FLIGHT = 250;

export class AnalyticsError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
  ) {
    super(message);
  }
}

interface BusinessMeta {
  id: string;
  name: string;
  createdAt: Date;
}

type BusinessMetaEntry = { value: BusinessMeta; expiresAt: number };

const businessMetaCache = new Map<string, BusinessMetaEntry>();
const businessMetaInFlight = new Map<string, Promise<BusinessMeta>>();
const analyticsInFlight = new Map<string, Promise<unknown>>();
const analyticsQueryInFlight = new Map<string, Promise<unknown>>();

function evictOldest<T>(cache: Map<string, T>, maximum: number) {
  if (cache.size < maximum) return;
  const oldestKey = cache.keys().next().value as string | undefined;
  if (oldestKey) cache.delete(oldestKey);
}

async function loadBusiness(businessId: string): Promise<BusinessMeta> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, createdAt: true },
  });
  if (!business) throw new AnalyticsError("Business not found", 404, "NOT_FOUND");
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

function getCacheKey(businessId: string, domain: string, preset: AnalyticsPreset) {
  return `analytics:${CACHE_VERSION}:${businessId}:${domain}:${preset}`;
}

async function readCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch {
    return null;
  }
}

async function writeCached<T>(key: string, value: T) {
  try {
    await redis.set(key, JSON.stringify(value), CACHE_TTL_SECONDS);
  } catch {
    // Redis is an optimisation only. The computed database result is still valid.
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

function getAcquisitionSources(businessId: string) {
  return coalesceAnalyticsQuery(`acquisition:${businessId}`, () =>
    customerQueries.getAcquisitionSources(businessId),
  );
}

function getRetentionCohorts(businessId: string) {
  return coalesceAnalyticsQuery(`retention:${businessId}`, () =>
    customerQueries.computeRetentionCohorts(businessId),
  );
}

function getRevenueTrend(
  businessId: string,
  from: Date,
  to: Date,
  granularity: Parameters<typeof revenueQueries.getRevenueTrend>[3],
) {
  const key = `revenue-trend:${businessId}:${from.toISOString()}:${to.toISOString()}:${granularity}`;
  return coalesceAnalyticsQuery(key, () =>
    revenueQueries.getRevenueTrend(businessId, from, to, granularity),
  );
}

function metadata(
  preset: AnalyticsPreset,
  from: Date,
  to: Date,
  granularity: string,
) {
  return {
    range: { preset, from, to, granularity },
    timezone: BUSINESS_TIMEZONE,
    generatedAt: new Date().toISOString(),
  };
}

function sum<T>(rows: T[], getter: (row: T) => number) {
  return rows.reduce((total, row) => total + getter(row), 0);
}

function retentionRate(
  rows: customerQueries.RetentionCohortRow[],
  field: "retained30" | "retained60" | "retained90",
  days: number,
) {
  const cutoff = DateTime.now().setZone(BUSINESS_TIMEZONE).minus({ days });
  const mature = rows.filter(
    (row) =>
      DateTime.fromJSDate(row.cohortStart)
        .setZone(BUSINESS_TIMEZONE)
        .endOf("month") <= cutoff,
  );
  const total = sum(mature, (row) => row.totalCustomers);
  if (!total) return null;
  return (sum(mature, (row) => row[field]) / total) * 100;
}

class AnalyticsService {
  async getRevenueAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "revenue", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to, granularity } = resolveRange(preset, business.createdAt);
      const [trend, byCategory, byWeekday, customItems] = await Promise.all([
        getRevenueTrend(businessId, from, to, granularity),
        revenueQueries.getRevenueByCategory(businessId, from, to),
        revenueQueries.getRevenueByWeekday(businessId, from, to),
        summaryQueries.getCustomItemRevenue(businessId, from, to),
      ]);
      const revenueCents = sum(trend, (row) => row.totalCents);
      const paidInvoiceCount = sum(trend, (row) => row.invoiceCount);
      const averageInvoiceValue = {
        averageCents:
          paidInvoiceCount > 0
            ? Math.round(revenueCents / paidInvoiceCount)
            : 0,
        invoiceCount: paidInvoiceCount,
      };
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
        (a, b) => b.totalCents - a.totalCents,
      )[0];
      const bestWeekday = bestWeekdayRow
        ? {
            weekday: bestWeekdayRow.weekday,
            totalCents: bestWeekdayRow.totalCents,
          }
        : null;

      return {
        ...metadata(preset, from, to, granularity),
        summary: {
          revenueCents,
          paidInvoiceCount,
          averageInvoiceCents: averageInvoiceValue.averageCents,
          customItemRevenueCents: sum(customItems, (row) => row.totalCents),
          customItemQuantity: sum(customItems, (row) => row.quantity),
          topCategory,
          bestWeekday,
        },
        trend,
        byCategory,
        byWeekday,
        customItems,
        averageInvoiceValue,
        averageInvoiceValueTrend,
      };
    });
  }

  async getCustomerAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "customers", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to, granularity } = resolveRange(preset, business.createdAt);
      const lapsedThreshold = DateTime.now()
        .setZone(BUSINESS_TIMEZONE)
        .minus({ days: DEFAULT_LAPSED_DAYS })
        .toUTC()
        .toJSDate();

      const [
        rangeSummary,
        newVsReturning,
        lifetimeValue,
        lifetimeValueAllTime,
        acquisitionSources,
        lapsedItems,
        lapsedTotal,
        retentionCohorts,
        cancellationRate,
      ] = await Promise.all([
        summaryQueries.getCustomerRangeSummary(businessId, from, to),
        customerQueries.getNewVsReturningCustomers(
          businessId,
          from,
          to,
          granularity,
        ),
        customerQueries.getCustomerLifetimeValue(businessId, from, to),
        customerQueries.getCustomerLifetimeValue(businessId),
        getAcquisitionSources(businessId),
        customerQueries.getLapsedCustomers(businessId, lapsedThreshold),
        prisma.customer.count({
          where: { businessId, lastVisitAt: { lte: lapsedThreshold } },
        }),
        getRetentionCohorts(businessId),
        customerQueries.getCancellationRateOverTime(
          businessId,
          from,
          to,
          granularity,
        ),
      ]);

      const noShowRate = cancellationRate.map((row) => {
        const denominator = row.completedCount + row.noShowCount;
        return {
          bucket: row.bucket,
          noShowCount: row.noShowCount,
          completedCount: row.completedCount,
          rate:
            denominator === 0 ? 0 : (row.noShowCount / denominator) * 100,
        };
      });
      const completedCount = sum(
        cancellationRate,
        (row) => row.completedCount,
      );
      const noShowCount = sum(cancellationRate, (row) => row.noShowCount);
      const cancellationCount = sum(
        cancellationRate,
        (row) => row.totalCancelled,
      );
      const appointmentOutcomeCount =
        completedCount + noShowCount + cancellationCount;
      const noShowDenominator = completedCount + noShowCount;

      return {
        ...metadata(preset, from, to, granularity),
        summary: {
          activeCustomers: rangeSummary.activeCustomers,
          newCustomers: rangeSummary.newCustomers,
          returningCustomers: rangeSummary.returningCustomers,
          lapsedCustomerCount: lapsedTotal,
          noShowRate:
            noShowDenominator > 0
              ? (noShowCount / noShowDenominator) * 100
              : 0,
          noShowCount,
          completedCount,
          cancellationRate:
            appointmentOutcomeCount > 0
              ? (cancellationCount / appointmentOutcomeCount) * 100
              : 0,
          cancellationCount,
          appointmentOutcomeCount,
        },
        retentionSummary: {
          day30Rate: retentionRate(retentionCohorts, "retained30", 30),
          day60Rate: retentionRate(retentionCohorts, "retained60", 60),
          day90Rate: retentionRate(retentionCohorts, "retained90", 90),
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

  async getStaffAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "staff", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to } = resolveRange(preset, business.createdAt);
      const [revenueGenerated, utilization] = await Promise.all([
        staffQueries.getStaffRevenue(businessId, from, to),
        staffQueries.computeStaffUtilization(businessId, from, to),
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
            utilizationRate:
              availableMinutes > 0
                ? (bookedMinutes / availableMinutes) * 100
                : 0,
          };
        })
        .sort((a, b) => b.totalCents - a.totalCents);

      return {
        ...metadata(preset, from, to, "day"),
        summary: {
          revenueCents: sum(staffPerformance, (row) => row.totalCents),
          commissionCents: sum(
            staffPerformance,
            (row) => row.commissionEarnedCents,
          ),
          averageUtilizationRate: staffPerformance.length
            ? sum(staffPerformance, (row) => row.utilizationRate) /
              staffPerformance.length
            : 0,
          lowUtilizationCount: staffPerformance.filter(
            (row) => row.utilizationRate < 40,
          ).length,
        },
        staffPerformance,
      };
    });
  }

  async getOperationsAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "operations", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to, granularity } = resolveRange(preset, business.createdAt);
      const [heatmap, mostBookedServices, leadTimes] = await Promise.all([
        operationsQueries.getBookingHeatmap(businessId, from, to),
        operationsQueries.getMostBookedServices(businessId, from, to),
        operationsQueries.computeBookingLeadTimes(businessId, from, to),
      ]);
      const busiest =
        [...heatmap].sort((a, b) => b.count - a.count)[0] ?? null;
      const mostBookedService = mostBookedServices[0] ?? null;
      return {
        ...metadata(preset, from, to, granularity),
        summary: {
          bookingCount: sum(heatmap, (row) => row.count),
          busiestWeekday: busiest?.weekday ?? null,
          busiestHour: busiest?.hour ?? null,
          mostBookedService,
        },
        heatmap,
        mostBookedServices,
        leadTimes,
      };
    });
  }

  async getGrowthAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "growth", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to } = resolveRange(preset, business.createdAt);
      const [monthlyRevenue, acquisitionSources, retentionCohorts] =
        await Promise.all([
          getRevenueTrend(businessId, from, to, "month"),
          getAcquisitionSources(businessId),
          getRetentionCohorts(businessId),
        ]);
      const monthlyGrowth =
        growthQueries.computeMonthOverMonthGrowth(monthlyRevenue);
      const current = monthlyGrowth.at(-1) ?? null;
      const previous = monthlyGrowth.at(-2) ?? null;
      const bestGrowthMonth =
        monthlyGrowth
          .filter((row) => row.growthPct !== null)
          .sort((a, b) => (b.growthPct ?? 0) - (a.growthPct ?? 0))[0] ?? null;
      return {
        ...metadata(preset, from, to, "month"),
        summary: {
          currentMonthRevenueCents: current?.totalCents ?? 0,
          previousMonthRevenueCents: previous?.totalCents ?? 0,
          monthOverMonthGrowthPct: current?.growthPct ?? null,
          bestGrowthMonth,
        },
        monthlyGrowth,
        acquisitionSources,
        retentionCohorts,
      };
    });
  }

  async getDashboardOverview(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "overview", preset), async () => {
      const business = await resolveBusiness(businessId);
      const [revenue, customers, staff, operations, growth] = await Promise.all([
        this.getRevenueAnalytics(businessId, preset),
        this.getCustomerAnalytics(businessId, preset),
        this.getStaffAnalytics(businessId, preset),
        this.getOperationsAnalytics(businessId, preset),
        this.getGrowthAnalytics(businessId, preset),
      ]);
      return {
        businessId: business.id,
        businessName: business.name,
        timezone: BUSINESS_TIMEZONE,
        generatedAt: new Date().toISOString(),
        revenue,
        customers,
        staff,
        operations,
        growth,
      };
    });
  }
}

export default new AnalyticsService();
