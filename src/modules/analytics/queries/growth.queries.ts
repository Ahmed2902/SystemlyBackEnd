import type { RevenueTrendRow } from "./revenue.queries";

export interface PeriodGrowthRow {
  bucket: Date;
  totalCents: number;
  invoiceCount: number;
  growthPct: number | null;
}

/**
 * Period-over-period growth for already-complete buckets. The caller decides
 * whether the buckets represent complete weeks or complete months.
 */
export function computePeriodOverPeriodGrowth(
  rows: RevenueTrendRow[],
): PeriodGrowthRow[] {
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    const growthPct =
      previous && previous.totalCents > 0
        ? Math.round(
            (((row.totalCents - previous.totalCents) /
              previous.totalCents) *
              100) *
              10,
          ) / 10
        : null;

    return {
      bucket: row.bucket,
      totalCents: row.totalCents,
      invoiceCount: row.invoiceCount,
      growthPct,
    };
  });
}

/** Backward-compatible export for existing imports and tests. */
export const computeMonthOverMonthGrowth = computePeriodOverPeriodGrowth;
export type MonthGrowthRow = PeriodGrowthRow;
