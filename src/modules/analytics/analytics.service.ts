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
import * as staffQueries from "./queries/staff.queries";
import * as operationsQueries from "./queries/operations.queries";
import * as growthQueries from "./queries/growth.queries";

const CACHE_TTL_SECONDS = 120;
const DEFAULT_LAPSED_DAYS = 45;

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

async function resolveBusiness(businessId: string): Promise<BusinessMeta> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, createdAt: true },
  });
  if (!business) throw new AnalyticsError("Business not found", 404, "NOT_FOUND");
  return business;
}

function getCacheKey(businessId: string, domain: string, preset: AnalyticsPreset) {
  return `analytics:${businessId}:${domain}:${preset}`;
}

async function withCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
    const value = await loader();
    await redis.set(key, JSON.stringify(value), CACHE_TTL_SECONDS);
    return value;
  } catch {
    return loader();
  }
}

function metadata(preset: AnalyticsPreset, from: Date, to: Date, granularity: string) {
  return {
    range: { preset, from, to, granularity },
    timezone: BUSINESS_TIMEZONE,
    generatedAt: new Date().toISOString(),
  };
}

function sum<T>(rows: T[], getter: (row: T) => number) {
  return rows.reduce((total, row) => total + getter(row), 0);
}

function latestRate(rows: { rate: number }[]) {
  return rows.at(-1)?.rate ?? 0;
}

function retentionRate(
  rows: customerQueries.RetentionCohortRow[],
  field: "retained30" | "retained60" | "retained90",
  days: number,
) {
  const cutoff = DateTime.now().setZone(BUSINESS_TIMEZONE).minus({ days });
  const mature = rows.filter(
    (row) => DateTime.fromJSDate(row.cohortStart).setZone(BUSINESS_TIMEZONE) <= cutoff,
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
      const [trend, byCategory, byWeekday, averageInvoiceValue, outstanding, averageInvoiceValueTrend] =
        await Promise.all([
          revenueQueries.getRevenueTrend(businessId, from, to, granularity),
          revenueQueries.getRevenueByCategory(businessId, from, to),
          revenueQueries.getRevenueByWeekday(businessId, from, to),
          revenueQueries.getAverageInvoiceValue(businessId, from, to),
          revenueQueries.getOutstandingInvoices(businessId),
          revenueQueries.getAverageInvoiceValueTrend(businessId, from, to, granularity),
        ]);

      return {
        ...metadata(preset, from, to, granularity),
        summary: {
          revenueCents: sum(trend, (row) => row.totalCents),
          paidInvoiceCount: sum(trend, (row) => row.invoiceCount),
          averageInvoiceCents: averageInvoiceValue.averageCents,
          outstandingInvoiceCount: outstanding.count,
          outstandingTotalCents: outstanding.totalCents,
        },
        trend,
        byCategory,
        byWeekday,
        averageInvoiceValue,
        outstanding,
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
        newVsReturning,
        lifetimeValue,
        lifetimeValueAllTime,
        acquisitionSources,
        lapsedItems,
        lapsedTotal,
        retentionCohorts,
        noShowRate,
        cancellationRate,
      ] = await Promise.all([
        customerQueries.getNewVsReturningCustomers(businessId, from, to, granularity),
        customerQueries.getCustomerLifetimeValue(businessId, from, to),
        customerQueries.getCustomerLifetimeValue(businessId),
        customerQueries.getAcquisitionSources(businessId),
        customerQueries.getLapsedCustomers(businessId, lapsedThreshold),
        prisma.customer.count({ where: { businessId, lastVisitAt: { lte: lapsedThreshold } } }),
        customerQueries.computeRetentionCohorts(businessId),
        customerQueries.getNoShowRateOverTime(businessId, from, to, granularity),
        customerQueries.getCancellationRateOverTime(businessId, from, to, granularity),
      ]);

      return {
        ...metadata(preset, from, to, granularity),
        summary: {
          newCustomers: sum(newVsReturning, (row) => row.newCustomers),
          returningCustomers: sum(newVsReturning, (row) => row.returningCustomers),
          lapsedCustomerCount: lapsedTotal,
          noShowRate: latestRate(noShowRate),
          cancellationRate: latestRate(cancellationRate),
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
        lapsedCustomers: { total: lapsedTotal, items: lapsedItems },
        retentionCohorts,
        noShowRate,
        cancellationRate,
      };
    });
  }

  async getStaffAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "staff", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to, granularity } = resolveRange(preset, business.createdAt);
      const [revenueGenerated, utilization] = await Promise.all([
        staffQueries.getStaffRevenue(businessId, from, to),
        staffQueries.computeStaffUtilization(businessId, from, to),
      ]);
      const revenueById = new Map(revenueGenerated.map((row) => [row.id, row]));
      const utilizationById = new Map(utilization.map((row) => [row.id, row]));
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
            utilizationRate:
              availableMinutes > 0 ? (bookedMinutes / availableMinutes) * 100 : 0,
          };
        })
        .sort((a, b) => b.totalCents - a.totalCents);

      return {
        ...metadata(preset, from, to, granularity),
        summary: {
          revenueCents: sum(staffPerformance, (row) => row.totalCents),
          commissionCents: sum(staffPerformance, (row) => row.commissionEarnedCents),
          averageUtilizationRate: staffPerformance.length
            ? sum(staffPerformance, (row) => row.utilizationRate) / staffPerformance.length
            : 0,
          lowUtilizationCount: staffPerformance.filter((row) => row.utilizationRate < 40).length,
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
      const busiest = [...heatmap].sort((a, b) => b.count - a.count)[0] ?? null;
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
      const [monthlyRevenue, acquisitionSources, retentionCohorts] = await Promise.all([
        revenueQueries.getRevenueTrend(businessId, from, to, "month"),
        customerQueries.getAcquisitionSources(businessId),
        customerQueries.computeRetentionCohorts(businessId),
      ]);
      const monthlyGrowth = growthQueries.computeMonthOverMonthGrowth(monthlyRevenue);
      const current = monthlyGrowth.at(-1) ?? null;
      const previous = monthlyGrowth.at(-2) ?? null;
      const bestGrowthMonth = monthlyGrowth
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
