import type { AnalyticsGranularity } from "./analytics.schema";

export interface AnalyticsRange {
  from: Date;
  to: Date;
  granularity: AnalyticsGranularity;
  lapsedDays: number;
  lapsedThreshold: Date;
}

export interface AnalyticsBusinessMeta {
  id: string;
  name: string;
  timezone: string;
}

export interface AnalyticsBucketPoint {
  key: string;
  label: string;
  totalCents: number;
  count: number;
}

export interface AnalyticsTrendPoint extends AnalyticsBucketPoint {
  averageInvoiceValueCents: number;
}

export interface RevenueByCategoryPoint {
  category: string;
  totalCents: number;
  count: number;
}

export interface RevenueByWeekdayPoint {
  weekday: number;
  label: string;
  totalCents: number;
  count: number;
}

export interface MonthGrowthPoint {
  key: string;
  label: string;
  revenueCents: number;
  previousRevenueCents: number;
  growthRate: number | null;
}

export interface SummarySection {
  customersCount: number;
  appointmentsCount: number;
  servicesCount: number;
  staffCount: number;
  paidInvoiceCount: number;
  revenueCents: number;
  averageInvoiceValueCents: number;
  outstandingInvoiceCount: number;
  outstandingInvoiceTotalCents: number;
  newCustomersCount: number;
  returningCustomersCount: number;
  lapsedCustomersCount: number;
}

export interface RevenueSection {
  revenueTrend: AnalyticsTrendPoint[];
  revenueByCategory: RevenueByCategoryPoint[];
  revenueByWeekday: RevenueByWeekdayPoint[];
  averageInvoiceValueTrend: AnalyticsTrendPoint[];
  monthOverMonthGrowth: MonthGrowthPoint[];
}

export interface CustomerTrendPoint {
  key: string;
  label: string;
  newCustomers: number;
  returningCustomers: number;
}

export interface TopCustomerPoint {
  id: string;
  name: string;
  totalCents: number;
  count: number;
}

export interface MostFrequentCustomerPoint {
  id: string;
  name: string;
  visitCount: number;
}

export interface AcquisitionSourcePoint {
  source: string;
  count: number;
}

export interface LapsedCustomerPoint {
  id: string;
  name: string;
  lastVisitAt: string | null;
  daysSinceLastVisit: number;
}

export interface RetentionCohortPoint {
  key: string;
  label: string;
  totalCustomers: number;
  retained30: number;
  retained60: number;
  retained90: number;
  retention30Rate: number;
  retention60Rate: number;
  retention90Rate: number;
}

export interface CustomerSection {
  customerLifetimeValue: TopCustomerPoint[];
  mostFrequentCustomers: MostFrequentCustomerPoint[];
  acquisitionSources: AcquisitionSourcePoint[];
  newVsReturning: CustomerTrendPoint[];
  lapsedCustomers: LapsedCustomerPoint[];
  retentionCohorts: RetentionCohortPoint[];
}

export interface StaffRevenuePoint {
  id: string;
  name: string;
  totalCents: number;
  count: number;
  commissionEarnedCents: number;
}

export interface StaffUtilizationPoint {
  id: string;
  name: string;
  bookedMinutes: number;
  availableMinutes: number;
  utilizationRate: number;
}

export interface StaffSection {
  revenueGenerated: StaffRevenuePoint[];
  commissionEarned: StaffRevenuePoint[];
  utilizationRate: StaffUtilizationPoint[];
}

export interface BookingHeatmapPoint {
  weekday: number;
  hour: number;
  count: number;
}

export interface MostBookedServicePoint {
  id: string;
  name: string;
  category: string;
  count: number;
}

export interface BookingLeadTimePoint {
  bucket: string;
  label: string;
  count: number;
}

export interface ServiceDurationAccuracyPoint {
  status: "not_available";
  reason: string;
}

export interface OperationsSection {
  bookingHeatmap: BookingHeatmapPoint[];
  mostBookedServices: MostBookedServicePoint[];
  bookingLeadTimes: BookingLeadTimePoint[];
  serviceDurationAccuracy: ServiceDurationAccuracyPoint;
}

export interface GrowthSection {
  monthOverMonthRevenueGrowth: MonthGrowthPoint[];
  customerAcquisitionBySource: AcquisitionSourcePoint[];
  retentionCohorts: RetentionCohortPoint[];
}

export interface DashboardOverview {
  businessId: string;
  businessName: string;
  timezone: string;
  generatedAt: string;
  range: {
    from: string;
    to: string;
    granularity: AnalyticsGranularity;
  };
  summary: SummarySection;
  revenue: RevenueSection;
  customers: CustomerSection;
  staff: StaffSection;
  operations: OperationsSection;
  growth: GrowthSection;
}

export interface RevenueTrendRow {
  bucketStart: Date;
  totalCents: number;
  count: number;
}

export interface RevenueCategoryRow {
  category: string | null;
  totalCents: number;
  count: number;
}

export interface RevenueWeekdayRow {
  weekday: number;
  totalCents: number;
  count: number;
}

export interface MonthGrowthRow {
  monthStart: Date;
  totalCents: number;
  count: number;
}

export interface CustomerLifetimeRow {
  id: string;
  name: string;
  totalCents: number;
  count: number;
}

export interface MostFrequentCustomerRow {
  id: string;
  name: string;
  visitCount: number;
}

export interface AcquisitionSourceRow {
  source: string | null;
  count: number;
}

export interface CustomerTrendRow {
  bucketStart: Date;
  newCustomers: number;
  returningCustomers: number;
}

export interface LapsedCustomerRow {
  id: string;
  name: string;
  lastVisitAt: Date | string | null;
  daysSinceLastVisit: number;
}

export interface RetentionCohortRow {
  cohortStart: Date;
  totalCustomers: number;
  retained30: number;
  retained60: number;
  retained90: number;
}

export interface StaffRevenueRow {
  id: string;
  name: string;
  totalCents: number;
  count: number;
  commissionEarnedCents: number;
}

export interface StaffUtilizationRow {
  id: string;
  name: string;
  bookedMinutes: number;
  availableMinutes: number;
}

export interface BookingHeatmapRow {
  weekday: number;
  hour: number;
  count: number;
}

export interface MostBookedServiceRow {
  id: string;
  name: string;
  category: string | null;
  count: number;
}

export interface BookingLeadTimeRow {
  bucket: string;
  count: number;
}

export interface AnalyticsDashboardContext {
  business: AnalyticsBusinessMeta;
  range: AnalyticsRange;
  summary: {
    customersCount: number;
    appointmentsCount: number;
    servicesCount: number;
    staffCount: number;
    paidInvoiceCount: number;
    revenueCents: number;
    averageInvoiceValueCents: number;
    outstandingInvoiceCount: number;
    outstandingInvoiceTotalCents: number;
    newCustomersCount: number;
    returningCustomersCount: number;
    lapsedCustomersCount: number;
  };
  revenue: {
    trend: RevenueTrendRow[];
    byCategory: RevenueCategoryRow[];
    byWeekday: RevenueWeekdayRow[];
    monthlyGrowth: MonthGrowthRow[];
  };
  customers: {
    lifetimeValue: CustomerLifetimeRow[];
    mostFrequent: MostFrequentCustomerRow[];
    acquisitionSources: AcquisitionSourceRow[];
    newVsReturning: CustomerTrendRow[];
    lapsedCustomers: LapsedCustomerRow[];
    retentionCohorts: RetentionCohortRow[];
  };
  staff: {
    revenueGenerated: StaffRevenueRow[];
    commissionEarned: StaffRevenueRow[];
    utilization: StaffUtilizationRow[];
  };
  operations: {
    heatmap: BookingHeatmapRow[];
    mostBookedServices: MostBookedServiceRow[];
    leadTimes: BookingLeadTimeRow[];
  };
  growth: {
    monthlyGrowth: MonthGrowthRow[];
    acquisitionSources: AcquisitionSourceRow[];
    retentionCohorts: RetentionCohortRow[];
  };
}
