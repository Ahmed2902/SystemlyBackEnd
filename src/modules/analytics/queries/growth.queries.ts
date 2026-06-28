import type { RevenueTrendRow } from "./revenue.queries";

export interface MonthGrowthRow {
  bucket: Date;
  totalCents: number;
  invoiceCount: number;
  growthPct: number | null; // null for the first bucket, no prior month to compare
}

/**
 * Month-over-month revenue growth, derived from an already-fetched monthly
 * revenue trend (call getRevenueTrend with granularity="month" and pass the
 * result here) -- not a new query, per the PROJECT.md note that this is
 * "derived from the money analytics above."
 */
export function computeMonthOverMonthGrowth(
  monthlyRevenueRows: RevenueTrendRow[],
): MonthGrowthRow[] {
  return monthlyRevenueRows.map((row, index) => {
    const previous = monthlyRevenueRows[index - 1];
    const growthPct =
      previous && previous.totalCents > 0
        ? ((row.totalCents - previous.totalCents) / previous.totalCents) * 100
        : null;

    return {
      bucket: row.bucket,
      totalCents: row.totalCents,
      invoiceCount: row.invoiceCount,
      growthPct,
    };
  });
}
