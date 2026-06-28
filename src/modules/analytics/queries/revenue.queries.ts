import { Prisma } from "@prisma/client";
import { prisma } from "../../../shared/db/prisma";
import { BUSINESS_TIMEZONE } from "../presets";
import { assertSafeGranularity } from "../utils";
import type { Granularity } from "../presets";

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
  weekday: number; // 0 = Sunday ... 6 = Saturday (Postgres EXTRACT(DOW) convention)
  totalCents: number;
  invoiceCount: number;
}

export interface AverageInvoiceValue {
  averageCents: number;
  invoiceCount: number;
}

export interface OutstandingInvoices {
  count: number;
  totalCents: number;
}

/**
 * Revenue trend bucketed by granularity, zero-filled via generate_series so
 * the chart has no gaps for periods with no paid invoices.
 */
export async function getRevenueTrend(
  businessId: string,
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<RevenueTrendRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);

  const rows = await prisma.$queryRaw<
    { bucket: Date; total_cents: bigint; invoice_count: bigint }[]
  >(Prisma.sql`
    SELECT
      buckets.bucket,
      COALESCE(SUM(i.total_cents), 0) AS total_cents,
      COALESCE(COUNT(i.id), 0) AS invoice_count
    FROM generate_series(
      DATE_TRUNC(${safeGranularity}, ${from}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}),
      DATE_TRUNC(${safeGranularity}, ${to}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}),
      ${`1 ${safeGranularity}`}::interval
    ) AS buckets(bucket)
    LEFT JOIN invoices i
      ON DATE_TRUNC(${safeGranularity}, i.paid_at AT TIME ZONE ${BUSINESS_TIMEZONE}) = buckets.bucket
      AND i.business_id = ${businessId}::uuid
      AND i.status = 'paid'
      AND i.paid_at BETWEEN ${from} AND ${to}
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((r) => ({
    bucket: r.bucket,
    totalCents: Number(r.total_cents),
    invoiceCount: Number(r.invoice_count),
  }));
}

/**
 * Revenue grouped by service category, sourced from InvoiceLineItem since
 * that's where serviceId/category and totalCents per line live.
 */
export async function getRevenueByCategory(
  businessId: string,
  from: Date,
  to: Date,
): Promise<RevenueCategoryRow[]> {
  const rows = await prisma.$queryRaw<
    { category: string; total_cents: bigint; item_count: bigint }[]
  >(Prisma.sql`
    SELECT
      COALESCE(s.category, 'uncategorized') AS category,
      SUM(li.total_cents) AS total_cents,
      COUNT(*) AS item_count
    FROM invoice_line_items li
    JOIN invoices i ON i.id = li.invoice_id
    LEFT JOIN services s ON s.id = li.service_id
    WHERE i.business_id = ${businessId}::uuid
      AND i.status = 'paid'
      AND i.paid_at BETWEEN ${from} AND ${to}
    GROUP BY COALESCE(s.category, 'uncategorized')
    ORDER BY total_cents DESC
  `);

  return rows.map((r) => ({
    category: r.category,
    totalCents: Number(r.total_cents),
    itemCount: Number(r.item_count),
  }));
}

/**
 * Revenue averaged by day of week (0=Sunday..6=Saturday, Postgres EXTRACT(DOW)).
 * Useful for spotting weekend/weekday demand swings.
 */
export async function getRevenueByWeekday(
  businessId: string,
  from: Date,
  to: Date,
): Promise<RevenueWeekdayRow[]> {
  const rows = await prisma.$queryRaw<
    { weekday: number; total_cents: bigint; invoice_count: bigint }[]
  >(Prisma.sql`
    SELECT
      EXTRACT(DOW FROM i.paid_at AT TIME ZONE ${BUSINESS_TIMEZONE})::int AS weekday,
      SUM(i.total_cents) AS total_cents,
      COUNT(*) AS invoice_count
    FROM invoices i
    WHERE i.business_id = ${businessId}::uuid
      AND i.status = 'paid'
      AND i.paid_at BETWEEN ${from} AND ${to}
    GROUP BY weekday
    ORDER BY weekday
  `);

  return rows.map((r) => ({
    weekday: r.weekday,
    totalCents: Number(r.total_cents),
    invoiceCount: Number(r.invoice_count),
  }));
}

/**
 * Average paid invoice value over the range. Simple aggregate -- no raw SQL
 * needed, this is exactly what prisma.aggregate is for.
 */
export async function getAverageInvoiceValue(
  businessId: string,
  from: Date,
  to: Date,
): Promise<AverageInvoiceValue> {
  const result = await prisma.invoice.aggregate({
    where: {
      businessId,
      status: "paid",
      paidAt: { gte: from, lte: to },
    },
    _avg: { totalCents: true },
    _count: true,
  });

  return {
    averageCents: Math.round(result._avg.totalCents ?? 0),
    invoiceCount: result._count,
  };
}

/**
 * Outstanding (sent but not yet paid) invoices. Intentionally NOT
 * date-ranged -- an unpaid invoice from last month is still outstanding
 * today, regardless of which preset the dashboard is viewing.
 */
export async function getOutstandingInvoices(
  businessId: string,
): Promise<OutstandingInvoices> {
  const result = await prisma.invoice.aggregate({
    where: { businessId, status: "sent" },
    _sum: { totalCents: true },
    _count: true,
  });

  return {
    count: result._count,
    totalCents: result._sum.totalCents ?? 0,
  };
}
