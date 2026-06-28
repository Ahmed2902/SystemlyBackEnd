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

const CACHE_TTL_SECONDS = 120; // within the documented 30-300s window
const DEFAULT_LAPSED_DAYS = 45;

export class AnalyticsError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
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

  if (!business) {
    throw new AnalyticsError("Business not found", 404, "NOT_FOUND");
  }

  return business;
}

function getCacheKey(
  businessId: string,
  domain: string,
  preset: AnalyticsPreset,
) {
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
    // Cache failures should never break analytics -- fall back to a live compute.
    return loader();
  }
}

class AnalyticsService {
  async getRevenueAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "revenue", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to, granularity } = resolveRange(
        preset,
        business.createdAt,
      );

      const [trend, byCategory, byWeekday, averageInvoiceValue, outstanding] =
        await Promise.all([
          revenueQueries.getRevenueTrend(businessId, from, to, granularity),
          revenueQueries.getRevenueByCategory(businessId, from, to),
          revenueQueries.getRevenueByWeekday(businessId, from, to),
          revenueQueries.getAverageInvoiceValue(businessId, from, to),
          revenueQueries.getOutstandingInvoices(businessId),
        ]);

      return {
        range: { from, to, granularity },
        trend,
        byCategory,
        byWeekday,
        averageInvoiceValue,
        outstanding,
      };
    });
  }

  async getCustomerAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "customers", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to, granularity } = resolveRange(
        preset,
        business.createdAt,
      );

      const lapsedThreshold = DateTime.now()
        .setZone(BUSINESS_TIMEZONE)
        .minus({ days: DEFAULT_LAPSED_DAYS })
        .toUTC()
        .toJSDate();

      const [
        newVsReturning,
        lifetimeValue,
        acquisitionSources,
        lapsedCustomers,
        retentionCohorts,
      ] = await Promise.all([
        customerQueries.getNewVsReturningCustomers(
          businessId,
          from,
          to,
          granularity,
        ),
        customerQueries.getCustomerLifetimeValue(businessId, from, to),
        customerQueries.getAcquisitionSources(businessId),
        customerQueries.getLapsedCustomers(businessId, lapsedThreshold),
        customerQueries.computeRetentionCohorts(businessId),
      ]);

      return {
        range: { from, to, granularity },
        newVsReturning,
        lifetimeValue,
        acquisitionSources,
        lapsedCustomers,
        retentionCohorts,
      };
    });
  }

  async getStaffAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "staff", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to, granularity } = resolveRange(
        preset,
        business.createdAt,
      );

      const [revenueGenerated, utilization] = await Promise.all([
        staffQueries.getStaffRevenue(businessId, from, to),
        staffQueries.computeStaffUtilization(businessId, from, to),
      ]);

      return {
        range: { from, to, granularity },
        revenueGenerated,
        utilization,
      };
    });
  }

  async getOperationsAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(
      getCacheKey(businessId, "operations", preset),
      async () => {
        const business = await resolveBusiness(businessId);
        const { from, to, granularity } = resolveRange(
          preset,
          business.createdAt,
        );

        const [heatmap, mostBookedServices, leadTimes] = await Promise.all([
          operationsQueries.getBookingHeatmap(businessId, from, to),
          operationsQueries.getMostBookedServices(businessId, from, to),
          operationsQueries.computeBookingLeadTimes(businessId, from, to),
        ]);

        return {
          range: { from, to, granularity },
          heatmap,
          mostBookedServices,
          leadTimes,
        };
      },
    );
  }

  async getGrowthAnalytics(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "growth", preset), async () => {
      const business = await resolveBusiness(businessId);
      const { from, to } = resolveRange(preset, business.createdAt);

      // Growth is explicitly monthly regardless of the preset's own
      // granularity -- "month over month" only makes sense bucketed by month.
      const [monthlyRevenue, acquisitionSources, retentionCohorts] =
        await Promise.all([
          revenueQueries.getRevenueTrend(businessId, from, to, "month"),
          customerQueries.getAcquisitionSources(businessId),
          customerQueries.computeRetentionCohorts(businessId),
        ]);

      return {
        range: { from, to, granularity: "month" as const },
        monthlyGrowth:
          growthQueries.computeMonthOverMonthGrowth(monthlyRevenue),
        acquisitionSources,
        retentionCohorts,
      };
    });
  }

  /**
   * Combined landing-page view. Deliberately the one place that fetches
   * everything at once -- the per-tab methods above stay narrow.
   */
  async getDashboardOverview(businessId: string, preset: AnalyticsPreset) {
    return withCache(getCacheKey(businessId, "overview", preset), async () => {
      const business = await resolveBusiness(businessId);

      const [revenue, customers, staff, operations, growth] = await Promise.all(
        [
          this.getRevenueAnalytics(businessId, preset),
          this.getCustomerAnalytics(businessId, preset),
          this.getStaffAnalytics(businessId, preset),
          this.getOperationsAnalytics(businessId, preset),
          this.getGrowthAnalytics(businessId, preset),
        ],
      );

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

const analyticsService = new AnalyticsService();
export default analyticsService;
