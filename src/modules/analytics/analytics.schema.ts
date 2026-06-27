import { z } from "zod";

export const analyticsGranularitySchema = z.enum([
  "daily",
  "weekly",
  "monthly",
]);

export const analyticsBusinessParamsSchema = z.object({
  businessId: z.string().min(1),
});

export const analyticsStatsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  granularity: analyticsGranularitySchema.optional(),
  lapsedDays: z.coerce.number().int().positive().max(365).optional(),
});

export const analyticsBusinessQuerySchema = z.object({
  businessId: z.string().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  granularity: analyticsGranularitySchema.optional(),
  lapsedDays: z.coerce.number().int().positive().max(365).optional(),
});

const analyticsBucketSchema = z.object({
  key: z.string(),
  label: z.string(),
  totalCents: z.number().int(),
  count: z.number().int(),
});

const analyticsRankSchema = z.object({
  id: z.string(),
  name: z.string(),
  totalCents: z.number().int(),
  count: z.number().int(),
});

const analyticsHeatmapSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  count: z.number().int(),
});

const analyticsSourceSchema = z.object({
  source: z.string(),
  count: z.number().int(),
});

const analyticsStatusBreakdownSchema = z.object({
  pending: z.number().int(),
  confirmed: z.number().int(),
  completed: z.number().int(),
  cancelledByCustomer: z.number().int(),
  cancelledByBusiness: z.number().int(),
  noShow: z.number().int(),
  cancellationRate: z.number(),
  noShowRate: z.number(),
});

const analyticsSummarySchema = z.object({
  customersCount: z.number().int(),
  appointmentsCount: z.number().int(),
  servicesCount: z.number().int(),
  staffCount: z.number().int(),
  paidInvoiceCount: z.number().int(),
  revenueCents: z.number().int(),
  averageInvoiceValueCents: z.number().int(),
  outstandingInvoiceCount: z.number().int(),
  outstandingInvoiceTotalCents: z.number().int(),
  newCustomersCount: z.number().int(),
  returningCustomersCount: z.number().int(),
  lapsedCustomersCount: z.number().int(),
});

export const analyticsDashboardSchema = z.object({
  businessId: z.string(),
  businessName: z.string(),
  timezone: z.string(),
  generatedAt: z.string(),
  range: z.object({
    from: z.string(),
    to: z.string(),
    granularity: analyticsGranularitySchema,
  }),
  summary: analyticsSummarySchema,
  revenueTrend: z.array(analyticsBucketSchema),
  appointmentStatusBreakdown: analyticsStatusBreakdownSchema,
  topCustomers: z.array(analyticsRankSchema),
  topServices: z.array(analyticsRankSchema),
  staffRevenue: z.array(
    analyticsRankSchema.extend({ commissionEarnedCents: z.number().int() }),
  ),
  bookingHeatmap: z.array(analyticsHeatmapSchema),
  acquisitionSources: z.array(analyticsSourceSchema),
  lapsedCustomers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lastVisitAt: z.string().nullable(),
      daysSinceLastVisit: z.number().int(),
    }),
  ),
});

export type AnalyticsGranularity = z.infer<typeof analyticsGranularitySchema>;
export type AnalyticsBusinessParams = z.infer<
  typeof analyticsBusinessParamsSchema
>;
export type AnalyticsStatsQuery = z.infer<typeof analyticsStatsQuerySchema>;
export type AnalyticsBusinessQuery = z.infer<
  typeof analyticsBusinessQuerySchema
>;
export type AnalyticsDashboard = z.infer<typeof analyticsDashboardSchema>;
