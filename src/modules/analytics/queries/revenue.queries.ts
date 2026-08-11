import { Prisma } from "@prisma/client";
import { prisma } from "../../../shared/db/prisma";
import type { Granularity } from "../periods";
import { assertSafeGranularity } from "../utils";

const DEFAULT_TIMEZONE = "Africa/Cairo";

export interface RevenueTrendRow {
  bucket: Date;
  totalCents: number;
  invoiceCount: number;
}

export interface RevenueCategoryRow {
  category: string;
  totalCents: number;
  itemCount: number;
}

export interface RevenueWeekdayRow {
  weekday: number;
  totalCents: number;
  invoiceCount: number;
}

export interface AverageInvoiceValue {
  averageCents: number;
  invoiceCount: number;
}

export interface AverageInvoiceValueTrendRow {
  bucket: Date;
  averageCents: number | null;
  invoiceCount: number;
}

export async function getRevenueTrend(
  businessId: string,
  from: Date,
  toExclusive: Date,
  granularity: Granularity,
  timezone = DEFAULT_TIMEZONE,
  branchId?: string,
): Promise<RevenueTrendRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);
  const branchFilter = branchId
    ? Prisma.sql`AND i.branch_id = ${branchId}::uuid`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { bucket: Date; total_cents: bigint; invoice_count: bigint }[]
  >(Prisma.sql`
    WITH buckets AS (
      SELECT bucket
      FROM generate_series(
        DATE_TRUNC(${safeGranularity}, ${from}::timestamptz AT TIME ZONE ${timezone}),
        DATE_TRUNC(
          ${safeGranularity},
          (${toExclusive}::timestamptz - INTERVAL '1 microsecond') AT TIME ZONE ${timezone}
        ),
        ${`1 ${safeGranularity}`}::interval
      ) AS series(bucket)
    )
    SELECT
      buckets.bucket AT TIME ZONE ${timezone} AS bucket,
      COALESCE(SUM(i.total_cents), 0) AS total_cents,
      COALESCE(COUNT(i.id), 0) AS invoice_count
    FROM buckets
    LEFT JOIN invoices i
      ON (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) >= buckets.bucket
      AND (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})
          < buckets.bucket + ${`1 ${safeGranularity}`}::interval
      AND i.business_id = ${businessId}::uuid
      ${branchFilter}
      AND i.status = 'paid'
      AND i.paid_at >= ${from}
      AND i.paid_at < ${toExclusive}
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((row) => ({
    bucket: row.bucket,
    totalCents: Number(row.total_cents),
    invoiceCount: Number(row.invoice_count),
  }));
}

export async function getRevenueByCategory(
  businessId: string,
  from: Date,
  toExclusive: Date,
  branchId?: string,
): Promise<RevenueCategoryRow[]> {
  const branchFilter = branchId
    ? Prisma.sql`AND i.branch_id = ${branchId}::uuid`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { category: string; total_cents: bigint; item_count: bigint }[]
  >(Prisma.sql`
    SELECT
      CASE
        WHEN li.service_id IS NULL THEN 'Custom items'
        ELSE COALESCE(s.category, 'Uncategorized services')
      END AS category,
      SUM(li.total_cents) AS total_cents,
      COUNT(*) AS item_count
    FROM invoice_line_items li
    JOIN invoices i ON i.id = li.invoice_id
    LEFT JOIN services s ON s.id = li.service_id
    WHERE i.business_id = ${businessId}::uuid
      ${branchFilter}
      AND i.status = 'paid'
      AND i.paid_at >= ${from}
      AND i.paid_at < ${toExclusive}
    GROUP BY CASE
      WHEN li.service_id IS NULL THEN 'Custom items'
      ELSE COALESCE(s.category, 'Uncategorized services')
    END
    ORDER BY total_cents DESC
  `);

  return rows.map((row) => ({
    category: row.category,
    totalCents: Number(row.total_cents),
    itemCount: Number(row.item_count),
  }));
}

export async function getRevenueByWeekday(
  businessId: string,
  from: Date,
  toExclusive: Date,
  timezone = DEFAULT_TIMEZONE,
  branchId?: string,
): Promise<RevenueWeekdayRow[]> {
  const branchFilter = branchId
    ? Prisma.sql`AND i.branch_id = ${branchId}::uuid`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { weekday: number; total_cents: bigint; invoice_count: bigint }[]
  >(Prisma.sql`
    SELECT
      EXTRACT(
        DOW FROM (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})
      )::int AS weekday,
      SUM(i.total_cents) AS total_cents,
      COUNT(*) AS invoice_count
    FROM invoices i
    WHERE i.business_id = ${businessId}::uuid
      ${branchFilter}
      AND i.status = 'paid'
      AND i.paid_at >= ${from}
      AND i.paid_at < ${toExclusive}
    GROUP BY weekday
    ORDER BY weekday
  `);

  return rows.map((row) => ({
    weekday: row.weekday,
    totalCents: Number(row.total_cents),
    invoiceCount: Number(row.invoice_count),
  }));
}

export async function getAverageInvoiceValue(
  businessId: string,
  from: Date,
  toExclusive: Date,
  branchId?: string,
): Promise<AverageInvoiceValue> {
  const result = await prisma.invoice.aggregate({
    where: {
      businessId,
      ...(branchId ? { branchId } : {}),
      status: "paid",
      paidAt: { gte: from, lt: toExclusive },
    },
    _avg: { totalCents: true },
    _count: true,
  });

  return {
    averageCents: Math.round(result._avg.totalCents ?? 0),
    invoiceCount: result._count,
  };
}

export async function getAverageInvoiceValueTrend(
  businessId: string,
  from: Date,
  toExclusive: Date,
  granularity: Granularity,
  timezone = DEFAULT_TIMEZONE,
  branchId?: string,
): Promise<AverageInvoiceValueTrendRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);
  const branchFilter = branchId
    ? Prisma.sql`AND i.branch_id = ${branchId}::uuid`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { bucket: Date; average_cents: number | null; invoice_count: bigint }[]
  >(Prisma.sql`
    WITH buckets AS (
      SELECT bucket
      FROM generate_series(
        DATE_TRUNC(${safeGranularity}, ${from}::timestamptz AT TIME ZONE ${timezone}),
        DATE_TRUNC(
          ${safeGranularity},
          (${toExclusive}::timestamptz - INTERVAL '1 microsecond') AT TIME ZONE ${timezone}
        ),
        ${`1 ${safeGranularity}`}::interval
      ) AS series(bucket)
    )
    SELECT
      buckets.bucket AT TIME ZONE ${timezone} AS bucket,
      AVG(i.total_cents)::float AS average_cents,
      COUNT(i.id) AS invoice_count
    FROM buckets
    LEFT JOIN invoices i
      ON (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) >= buckets.bucket
      AND (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})
          < buckets.bucket + ${`1 ${safeGranularity}`}::interval
      AND i.business_id = ${businessId}::uuid
      ${branchFilter}
      AND i.status = 'paid'
      AND i.paid_at >= ${from}
      AND i.paid_at < ${toExclusive}
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((row) => ({
    bucket: row.bucket,
    averageCents:
      row.average_cents == null ? null : Math.round(row.average_cents),
    invoiceCount: Number(row.invoice_count),
  }));
}
