import { InvoiceStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import redis from "../../shared/config/redis";
import type {
  AnalyticsDashboardContext,
  AnalyticsBusinessMeta,
  AnalyticsRange,
  AcquisitionSourceRow,
  BookingHeatmapRow,
  BookingLeadTimeRow,
  CustomerLifetimeRow,
  CustomerTrendRow,
  LapsedCustomerRow,
  MonthGrowthRow,
  MostBookedServiceRow,
  MostFrequentCustomerRow,
  RevenueCategoryRow,
  RevenueTrendRow,
  RevenueWeekdayRow,
  RetentionCohortRow,
  StaffRevenueRow,
  StaffUtilizationRow,
} from "./analytics.types";
import type { AnalyticsStatsQuery } from "./analytics.schema";
import { buildSummary } from "./builders/summary.builder";
import { buildRevenueAnalytics } from "./builders/revenue.builder";
import { buildCustomerAnalytics } from "./builders/customer.builder";
import { buildStaffAnalytics } from "./builders/staff.builder";
import { buildOperationsAnalytics } from "./builders/operations.builder";
import { buildGrowthAnalytics } from "./builders/growth.builder";
import {
  ANALYTICS_CACHE_TTL_SECONDS,
  createBucketSeries,
  formatBucketKey,
  normalizeAnalyticsRange,
  toBusinessDateTime,
} from "./utils/date-buckets";
import { normalizeSource, toNumber } from "./utils/analytics.helpers";

const buildErr = (message: string, statusCode: number, code: string) => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

const sortByCount = <T extends { count: number }>(left: T, right: T) =>
  right.count - left.count;
const sortByTotal = <T extends { totalCents: number }>(left: T, right: T) =>
  right.totalCents - left.totalCents;
const sortByVisitCount = (
  left: MostFrequentCustomerRow,
  right: MostFrequentCustomerRow,
) => right.visitCount - left.visitCount;

const getCacheKey = (
  businessId: string,
  range: Pick<AnalyticsRange, "from" | "to" | "granularity">,
) => {
  return `analytics:${businessId}:${range.from.toISOString()}:${range.to.toISOString()}:${range.granularity}`;
};

const startOfLocalBucket = (
  date: Date,
  timezone: string,
  granularity: AnalyticsRange["granularity"],
) => {
  const local = toBusinessDateTime(date, timezone);
  if (granularity === "weekly") return local.startOf("week");
  if (granularity === "monthly") return local.startOf("month");
  return local.startOf("day");
};

class AnalyticsService {
  private async resolveBusiness(
    businessId: string,
  ): Promise<AnalyticsBusinessMeta> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, timezone: true },
    });

    if (!business) {
      throw buildErr("Business not found", 404, "NOT_FOUND");
    }

    return business;
  }

  private async loadDashboardContext(
    businessId: string,
    query?: AnalyticsStatsQuery,
  ): Promise<AnalyticsDashboardContext> {
    const business = await this.resolveBusiness(businessId);
    const range = normalizeAnalyticsRange(business.timezone, query);
    const lapsedThreshold = DateTime.now()
      .setZone(business.timezone)
      .minus({ days: range.lapsedDays })
      .toUTC()
      .toJSDate();

    const [
      customersCount,
      appointmentsCount,
      servicesCount,
      staffCount,
      customers,
      staff,
      availability,
      overrides,
      paidInvoices,
      sentInvoices,
      invoiceLineItems,
      appointmentsInRange,
      appointmentsForRetention,
      allPaidInvoices,
    ] = await Promise.all([
      prisma.customer.count({ where: { businessId } }),
      prisma.appointment.count({ where: { businessId } }),
      prisma.service.count({ where: { businessId } }),
      prisma.staff.count({ where: { businessId } }),
      prisma.customer.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          lastVisitAt: true,
          acquisitionSource: true,
        },
      }),
      prisma.staff.findMany({
        where: { businessId },
        select: { id: true, name: true, isActive: true },
      }),
      prisma.availability.findMany({
        where: { staff: { businessId } },
        select: {
          staffId: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          breakAfterMin: true,
        },
      }),
      prisma.availabilityOverride.findMany({
        where: { staff: { businessId } },
        select: {
          staffId: true,
          overrideDate: true,
          isDayOff: true,
          startTime: true,
          endTime: true,
        },
      }),
      prisma.invoice.findMany({
        where: {
          businessId,
          status: InvoiceStatus.paid,
          paidAt: { gte: range.from, lte: range.to },
        },
        select: {
          id: true,
          paidAt: true,
          totalCents: true,
          customerId: true,
          customer: {
            select: {
              id: true,
              name: true,
              createdAt: true,
              acquisitionSource: true,
            },
          },
        },
      }),
      prisma.invoice.findMany({
        where: { businessId, status: InvoiceStatus.sent },
        select: { totalCents: true },
      }),
      prisma.invoiceLineItem.findMany({
        where: {
          invoice: {
            businessId,
            status: InvoiceStatus.paid,
            paidAt: { gte: range.from, lte: range.to },
          },
        },
        select: {
          totalCents: true,
          commissionEarnedCents: true,
          staffId: true,
          staff: { select: { id: true, name: true } },
          serviceId: true,
          service: {
            select: { id: true, name: true, category: true, durationMin: true },
          },
        },
      }),
      prisma.appointment.findMany({
        where: { businessId, startsAt: { gte: range.from, lte: range.to } },
        select: {
          id: true,
          staffId: true,
          serviceId: true,
          customerId: true,
          startsAt: true,
          endsAt: true,
          createdAt: true,
          status: true,
          customer: { select: { id: true, createdAt: true, name: true } },
          staff: { select: { id: true, name: true } },
          service: {
            select: { id: true, name: true, category: true, durationMin: true },
          },
        },
      }),
      prisma.appointment.findMany({
        where: { businessId },
        select: {
          customerId: true,
          startsAt: true,
          customer: { select: { createdAt: true } },
        },
      }),
      prisma.invoice.findMany({
        where: { businessId, status: InvoiceStatus.paid },
        select: { paidAt: true, totalCents: true, customerId: true },
      }),
    ]);

    const revenueTrendRows = createBucketSeries(
      range.from,
      range.to,
      business.timezone,
      range.granularity,
    );
    const revenueTrendMap = new Map<string, RevenueTrendRow>();
    for (const bucket of revenueTrendRows) {
      revenueTrendMap.set(bucket.key, {
        bucketStart: startOfLocalBucket(
          range.from,
          business.timezone,
          range.granularity,
        )
          .toUTC()
          .toJSDate(),
        totalCents: 0,
        count: 0,
      });
    }

    const revenueByCategory = new Map<string, RevenueCategoryRow>();
    const revenueByWeekday = new Map<number, RevenueWeekdayRow>();
    const monthlyGrowth = new Map<string, MonthGrowthRow>();
    const acquisitionSources = new Map<string, AcquisitionSourceRow>();
    const customerLifetime = new Map<string, CustomerLifetimeRow>();
    const mostFrequent = new Map<string, MostFrequentCustomerRow>();
    const bookingHeatmap = new Map<string, BookingHeatmapRow>();
    const mostBookedServices = new Map<string, MostBookedServiceRow>();
    const leadTimes = new Map<string, BookingLeadTimeRow>();
    const staffRevenue = new Map<string, StaffRevenueRow>();
    const staffCommission = new Map<string, StaffRevenueRow>();
    const newVsReturning = new Map<string, CustomerTrendRow>();
    const retention = new Map<string, RetentionCohortRow>();

    let revenueCents = 0;
    for (const invoice of paidInvoices) {
      const local = toBusinessDateTime(
        invoice.paidAt as Date,
        business.timezone,
      );
      revenueCents += invoice.totalCents;

      const trendBucket = revenueTrendMap.get(
        formatBucketKey(local, range.granularity),
      );
      if (trendBucket) {
        trendBucket.totalCents += invoice.totalCents;
        trendBucket.count += 1;
      }

      const monthKey = local.toFormat("yyyy-LL");
      const monthRow = monthlyGrowth.get(monthKey) ?? {
        monthStart: local.startOf("month").toUTC().toJSDate(),
        totalCents: 0,
        count: 0,
      };
      monthRow.totalCents += invoice.totalCents;
      monthRow.count += 1;
      monthlyGrowth.set(monthKey, monthRow);

      const weekday = local.weekday % 7;
      const weekdayRow = revenueByWeekday.get(weekday) ?? {
        weekday,
        totalCents: 0,
        count: 0,
      };
      weekdayRow.totalCents += invoice.totalCents;
      weekdayRow.count += 1;
      revenueByWeekday.set(weekday, weekdayRow);

      const customer = invoice.customer;
      if (customer) {
        const lifetimeRow = customerLifetime.get(customer.id) ?? {
          id: customer.id,
          name: customer.name,
          totalCents: 0,
          count: 0,
        };
        lifetimeRow.totalCents += invoice.totalCents;
        lifetimeRow.count += 1;
        customerLifetime.set(customer.id, lifetimeRow);
      }
    }

    for (const item of invoiceLineItems) {
      const category = normalizeSource(item.service?.category);
      const revenueCategoryRow = revenueByCategory.get(category) ?? {
        category,
        totalCents: 0,
        count: 0,
      };
      revenueCategoryRow.totalCents += item.totalCents;
      revenueCategoryRow.count += 1;
      revenueByCategory.set(category, revenueCategoryRow);

      if (item.staffId) {
        const staffRow = staffRevenue.get(item.staffId) ?? {
          id: item.staffId,
          name: item.staff?.name ?? "Unknown staff",
          totalCents: 0,
          count: 0,
          commissionEarnedCents: 0,
        };
        staffRow.totalCents += item.totalCents;
        staffRow.count += 1;
        staffRow.commissionEarnedCents += item.commissionEarnedCents ?? 0;
        staffRevenue.set(item.staffId, staffRow);

        const commissionRow = staffCommission.get(item.staffId) ?? {
          id: item.staffId,
          name: item.staff?.name ?? "Unknown staff",
          totalCents: 0,
          count: 0,
          commissionEarnedCents: 0,
        };
        commissionRow.totalCents += item.totalCents;
        commissionRow.count += 1;
        commissionRow.commissionEarnedCents += item.commissionEarnedCents ?? 0;
        staffCommission.set(item.staffId, commissionRow);
      }
    }

    const customerById = new Map(
      customers.map((customer) => [customer.id, customer]),
    );
    for (const customer of customers) {
      const source = normalizeSource(customer.acquisitionSource);
      const acquisitionRow = acquisitionSources.get(source) ?? {
        source,
        count: 0,
      };
      acquisitionRow.count += 1;
      acquisitionSources.set(source, acquisitionRow);
    }

    for (const appointment of appointmentsInRange) {
      const local = toBusinessDateTime(appointment.startsAt, business.timezone);
      const weekday = local.weekday % 7;
      const key = `${weekday}:${local.hour}`;
      const heatmapRow = bookingHeatmap.get(key) ?? {
        weekday,
        hour: local.hour,
        count: 0,
      };
      heatmapRow.count += 1;
      bookingHeatmap.set(key, heatmapRow);

      const service = appointment.service;
      const serviceId = service?.id ?? appointment.serviceId;
      const bookedService = mostBookedServices.get(serviceId) ?? {
        id: serviceId,
        name: service?.name ?? "Unknown service",
        category: normalizeSource(service?.category),
        count: 0,
      };
      bookedService.count += 1;
      mostBookedServices.set(serviceId, bookedService);

      const created = toBusinessDateTime(
        appointment.createdAt,
        business.timezone,
      );
      const diffDays = Math.max(local.diff(created, "days").days, 0);
      const bucket =
        diffDays <= 0
          ? "same_day"
          : diffDays <= 2
            ? "1_2_days"
            : diffDays <= 7
              ? "3_7_days"
              : "1_week_plus";
      const leadRow = leadTimes.get(bucket) ?? { bucket, count: 0 };
      leadRow.count += 1;
      leadTimes.set(bucket, leadRow);

      const customerCreated = appointment.customer?.createdAt;
      if (customerCreated) {
        const customerLocal = toBusinessDateTime(
          customerCreated,
          business.timezone,
        );
        const cohortKey = customerLocal.toFormat("yyyy-LL");
        const row = retention.get(cohortKey) ?? {
          cohortStart: customerLocal.startOf("month").toUTC().toJSDate(),
          totalCustomers: 0,
          retained30: 0,
          retained60: 0,
          retained90: 0,
        };
        row.totalCustomers += 1;
        if (customerLocal.plus({ days: 30 }) <= local) row.retained30 += 1;
        if (customerLocal.plus({ days: 60 }) <= local) row.retained60 += 1;
        if (customerLocal.plus({ days: 90 }) <= local) row.retained90 += 1;
        retention.set(cohortKey, row);
      }

      const customer = appointment.customer;
      if (customer) {
        const bucketKey = formatBucketKey(local, range.granularity);
        const row = newVsReturning.get(bucketKey) ?? {
          bucketStart: startOfLocalBucket(
            appointment.startsAt,
            business.timezone,
            range.granularity,
          )
            .toUTC()
            .toJSDate(),
          newCustomers: 0,
          returningCustomers: 0,
        };
        if (customer.createdAt >= range.from) row.newCustomers += 1;
        else row.returningCustomers += 1;
        newVsReturning.set(bucketKey, row);
      }
    }

    const lapsedCustomers = await prisma.customer.findMany({
      where: { businessId, lastVisitAt: { lte: lapsedThreshold } },
      orderBy: { lastVisitAt: "asc" },
      take: 10,
      select: { id: true, name: true, lastVisitAt: true },
    });

    const availableStaff = new Set(
      staff.filter((item) => item.isActive).map((item) => item.id),
    );
    const bookedMinutesByStaff = new Map<string, number>();
    for (const appt of appointmentsInRange) {
      if (
        ["cancelled_by_customer", "cancelled_by_business", "no_show"].includes(
          appt.status,
        )
      )
        continue;
      const minutes = Math.max(
        Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60000),
        0,
      );
      bookedMinutesByStaff.set(
        appt.staffId,
        (bookedMinutesByStaff.get(appt.staffId) ?? 0) + minutes,
      );
    }

    const availableMinutesByStaff = new Map<string, number>();
    const days: DateTime[] = [];
    for (
      let cursor = toBusinessDateTime(range.from, business.timezone).startOf(
        "day",
      );
      cursor <= toBusinessDateTime(range.to, business.timezone).endOf("day");
      cursor = cursor.plus({ days: 1 })
    ) {
      days.push(cursor);
    }

    for (const member of staff) {
      if (!availableStaff.has(member.id)) {
        availableMinutesByStaff.set(member.id, 0);
        continue;
      }

      const staffAvailability = availability.filter(
        (entry) => entry.staffId === member.id,
      );
      const staffOverrides = overrides.filter(
        (entry) => entry.staffId === member.id,
      );
      let total = 0;
      for (const day of days) {
        const isoDay = day.toISODate();
        const override = staffOverrides.find(
          (entry) =>
            toBusinessDateTime(
              entry.overrideDate,
              business.timezone,
            ).toISODate() === isoDay,
        );
        if (override?.isDayOff) continue;

        const rows = staffAvailability.filter(
          (entry) => entry.dayOfWeek === day.weekday % 7,
        );
        for (const row of rows) {
          const start = toBusinessDateTime(row.startTime, business.timezone);
          const end = toBusinessDateTime(row.endTime, business.timezone);
          const breakAfterMin = row.breakAfterMin ?? 0;
          total += Math.max(
            Math.round(end.diff(start, "minutes").minutes) - breakAfterMin,
            0,
          );
        }

        if (override?.startTime && override?.endTime) {
          total += Math.max(
            Math.round(
              toBusinessDateTime(override.endTime, business.timezone).diff(
                toBusinessDateTime(override.startTime, business.timezone),
                "minutes",
              ).minutes,
            ),
            0,
          );
        }
      }
      availableMinutesByStaff.set(member.id, total);
    }

    const summary = {
      customersCount,
      appointmentsCount,
      servicesCount,
      staffCount,
      paidInvoiceCount: paidInvoices.length,
      revenueCents,
      averageInvoiceValueCents:
        paidInvoices.length > 0
          ? Math.round(revenueCents / paidInvoices.length)
          : 0,
      outstandingInvoiceCount: sentInvoices.length,
      outstandingInvoiceTotalCents: sentInvoices.reduce(
        (sum, invoice) => sum + invoice.totalCents,
        0,
      ),
      newCustomersCount: Array.from(newVsReturning.values()).reduce(
        (sum, row) => sum + row.newCustomers,
        0,
      ),
      returningCustomersCount: Array.from(newVsReturning.values()).reduce(
        (sum, row) => sum + row.returningCustomers,
        0,
      ),
      lapsedCustomersCount: lapsedCustomers.length,
    };

    return {
      business,
      range: { ...range, lapsedThreshold },
      summary,
      revenue: {
        trend: Array.from(revenueTrendMap.values()).sort(
          (left, right) =>
            left.bucketStart.getTime() - right.bucketStart.getTime(),
        ),
        byCategory: Array.from(revenueByCategory.values()).sort(sortByTotal),
        byWeekday: Array.from(revenueByWeekday.values()).sort(
          (left, right) => left.weekday - right.weekday,
        ),
        monthlyGrowth: Array.from(monthlyGrowth.values()).sort(
          (left, right) =>
            left.monthStart.getTime() - right.monthStart.getTime(),
        ),
      },
      customers: {
        lifetimeValue: Array.from(customerLifetime.values()).sort(sortByTotal),
        mostFrequent: Array.from(mostFrequent.values()).sort(sortByVisitCount),
        acquisitionSources: Array.from(acquisitionSources.values()).sort(
          sortByCount,
        ),
        newVsReturning: Array.from(newVsReturning.values()).sort(
          (left, right) =>
            left.bucketStart.getTime() - right.bucketStart.getTime(),
        ),
        lapsedCustomers: lapsedCustomers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          lastVisitAt: customer.lastVisitAt,
          daysSinceLastVisit: customer.lastVisitAt
            ? Math.floor(
                DateTime.now()
                  .setZone(business.timezone)
                  .diff(
                    toBusinessDateTime(customer.lastVisitAt, business.timezone),
                    "days",
                  ).days,
              )
            : 0,
        })),
        retentionCohorts: Array.from(retention.values()).sort(
          (left, right) =>
            left.cohortStart.getTime() - right.cohortStart.getTime(),
        ),
      },
      staff: {
        revenueGenerated: Array.from(staffRevenue.values()).sort(sortByTotal),
        commissionEarned: Array.from(staffCommission.values()).sort(
          sortByTotal,
        ),
        utilization: staff.map((member) => {
          const bookedMinutes = bookedMinutesByStaff.get(member.id) ?? 0;
          const availableMinutes = availableMinutesByStaff.get(member.id) ?? 0;
          return {
            id: member.id,
            name: member.name,
            bookedMinutes,
            availableMinutes,
          };
        }),
      },
      operations: {
        heatmap: Array.from(bookingHeatmap.values()).sort(
          (left, right) =>
            left.weekday - right.weekday || left.hour - right.hour,
        ),
        mostBookedServices: Array.from(mostBookedServices.values()).sort(
          sortByCount,
        ),
        leadTimes: Array.from(leadTimes.values()).sort((left, right) =>
          left.bucket.localeCompare(right.bucket),
        ),
      },
      growth: {
        monthlyGrowth: Array.from(monthlyGrowth.values()).sort(
          (left, right) =>
            left.monthStart.getTime() - right.monthStart.getTime(),
        ),
        acquisitionSources: Array.from(acquisitionSources.values()).sort(
          sortByCount,
        ),
        retentionCohorts: Array.from(retention.values()).sort(
          (left, right) =>
            left.cohortStart.getTime() - right.cohortStart.getTime(),
        ),
      },
    };
  }

  private async withCache<T>(
    businessId: string,
    range: AnalyticsRange,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cacheKey = getCacheKey(businessId, range);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as T;
      const value = await loader();
      await redis.set(
        cacheKey,
        JSON.stringify(value),
        ANALYTICS_CACHE_TTL_SECONDS,
      );
      return value;
    } catch {
      return loader();
    }
  }

  async getDashboardOverview(businessId: string, query?: AnalyticsStatsQuery) {
    const business = await this.resolveBusiness(businessId);
    const range = normalizeAnalyticsRange(business.timezone, query);
    const cacheKey = getCacheKey(businessId, range);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // fall through to recompute on cache failure
    }

    const context = await this.loadDashboardContext(businessId, query);
    const value = {
      businessId: context.business.id,
      businessName: context.business.name,
      timezone: context.business.timezone,
      generatedAt: new Date().toISOString(),
      range: {
        from: context.range.from.toISOString(),
        to: context.range.to.toISOString(),
        granularity: context.range.granularity,
      },
      summary: buildSummary(context),
      revenue: buildRevenueAnalytics(context),
      customers: buildCustomerAnalytics(context),
      staff: buildStaffAnalytics(context),
      operations: buildOperationsAnalytics(context),
      growth: buildGrowthAnalytics(context),
    };

    try {
      await redis.set(
        cacheKey,
        JSON.stringify(value),
        ANALYTICS_CACHE_TTL_SECONDS,
      );
    } catch {
      // analytics should still succeed if cache write fails
    }

    return value;
  }

  async getRevenueAnalytics(businessId: string, query?: AnalyticsStatsQuery) {
    const context = await this.loadDashboardContext(businessId, query);
    return buildRevenueAnalytics(context);
  }

  async getCustomerAnalytics(businessId: string, query?: AnalyticsStatsQuery) {
    const context = await this.loadDashboardContext(businessId, query);
    return buildCustomerAnalytics(context);
  }

  async getStaffAnalytics(businessId: string, query?: AnalyticsStatsQuery) {
    const context = await this.loadDashboardContext(businessId, query);
    return buildStaffAnalytics(context);
  }

  async getOperationsAnalytics(
    businessId: string,
    query?: AnalyticsStatsQuery,
  ) {
    const context = await this.loadDashboardContext(businessId, query);
    return buildOperationsAnalytics(context);
  }

  async getGrowthAnalytics(businessId: string, query?: AnalyticsStatsQuery) {
    const context = await this.loadDashboardContext(businessId, query);
    return buildGrowthAnalytics(context);
  }

  async getLegacyStats(businessId: string, query?: AnalyticsStatsQuery) {
    const context = await this.loadDashboardContext(businessId, query);
    return buildSummary(context);
  }
}

const analyticsService = new AnalyticsService();
export default analyticsService;
