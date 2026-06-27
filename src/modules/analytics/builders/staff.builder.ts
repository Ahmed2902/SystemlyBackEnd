import type {
  AnalyticsDashboardContext,
  StaffSection,
  StaffUtilizationPoint,
} from "../analytics.types";
import { toNumber, toPercentage } from "../utils/analytics.helpers";

const toStaffRows = (
  ctx: AnalyticsDashboardContext,
): StaffSection["revenueGenerated"] => {
  return ctx.staff.revenueGenerated.map((row) => ({
    id: row.id,
    name: row.name,
    totalCents: toNumber(row.totalCents, 0),
    count: toNumber(row.count, 0),
    commissionEarnedCents: toNumber(row.commissionEarnedCents, 0),
  }));
};

const toUtilization = (
  ctx: AnalyticsDashboardContext,
): StaffUtilizationPoint[] => {
  return ctx.staff.utilization.map((row) => ({
    id: row.id,
    name: row.name,
    bookedMinutes: toNumber(row.bookedMinutes, 0),
    availableMinutes: toNumber(row.availableMinutes, 0),
    utilizationRate: toPercentage(
      toNumber(row.bookedMinutes, 0),
      toNumber(row.availableMinutes, 0),
    ),
  }));
};

export const buildStaffAnalytics = (
  ctx: AnalyticsDashboardContext,
): StaffSection => {
  const revenueGenerated = toStaffRows(ctx);
  const commissionEarned = ctx.staff.commissionEarned.map((row) => ({
    id: row.id,
    name: row.name,
    totalCents: toNumber(row.totalCents, 0),
    count: toNumber(row.count, 0),
    commissionEarnedCents: toNumber(row.commissionEarnedCents, 0),
  }));

  return {
    revenueGenerated,
    commissionEarned,
    utilizationRate: toUtilization(ctx),
  };
};

export default buildStaffAnalytics;
