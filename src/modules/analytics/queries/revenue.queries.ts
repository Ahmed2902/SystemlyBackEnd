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
  to: Date,
  granularity: Granularity,
): Promise<RevenueTrendRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);
  const rows = await prisma.$queryRaw<
    { bucket: Date; total_cents: bigint; invoice_count: bigint }[]
  >(Prisma.sql`
    WITH buckets AS (
      SELECT bucket
      FROM generate_series(
        DATE_TRUNC(${safeGranularity}, ${from}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}),
        DATE_TRUNC(${safeGranularity}, ${to}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}),
        ${`1 ${safeGranularity}`}::interval
      ) AS series(bucket)
    )
    SELECT
      buckets.bucket AT TIME ZONE ${BUSINESS_TIMEZONE} AS bucket,
      COALESCE(SUM(i.total_cents), 0) AS total_cents,
      COALESCE(COUNT(i.id), 0) AS invoice_count
    FROM buckets
    LEFT JOIN invoices i
      ON (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE}) >= buckets.bucket
      AND (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE}) < buckets.bucket + ${`1 ${safeGranularity}`}::interval
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

export async function getRevenueByCategory(
  businessId: string,
  from: Date,
  to: Date,
): Promise<RevenueCategoryRow[]> {
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
      AND i.status = 'paid'
      AND i.paid_at BETWEEN ${from} AND ${to}
    GROUP BY CASE
      WHEN li.service_id IS NULL THEN 'Custom items'
      ELSE COALESCE(s.category, 'Uncategorized services')
    END
    ORDER BY total_cents DESC
  `);

  return rows.map((r) => ({
    category: r.category,
    totalCents: Number(r.total_cents),
    itemCount: Number(r.item_count),
  }));
}

export async function getRevenueByWeekday(
  businessId: string,
  from: Date,
  to: Date,
): Promise<RevenueWeekdayRow[]> {
  const rows = await prisma.$queryRaw<
    { weekday: number; total_cents: bigint; invoice_count: bigint }[]
  >(Prisma.sql`
    SELECT
      EXTRACT(
        DOW FROM (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE})
      )::int AS weekday,
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

export async function getAverageInvoiceValueTrend(
  businessId: string,
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<AverageInvoiceValueTrendRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);
  const rows = await prisma.$queryRaw<
    { bucket: Date; average_cents: number | null; invoice_count: bigint }[]
  >(Prisma.sql`
    WITH buckets AS (
      SELECT bucket
      FROM generate_series(
        DATE_TRUNC(${safeGranularity}, ${from}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}),
        DATE_TRUNC(${safeGranularity}, ${to}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}),
        ${`1 ${safeGranularity}`}::interval
      ) AS series(bucket)
    )
    SELECT
      buckets.bucket AT TIME ZONE ${BUSINESS_TIMEZONE} AS bucket,
      AVG(i.total_cents)::float AS average_cents,
      COUNT(i.id) AS invoice_count
    FROM buckets
    LEFT JOIN invoices i
      ON (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE}) >= buckets.bucket
      AND (i.paid_at AT TIME ZONE 'UTC' AT TIME ZONE ${BUSINESS_TIMEZONE}) < buckets.bucket + ${`1 ${safeGranularity}`}::interval
      AND i.business_id = ${businessId}::uuid
      AND i.status = 'paid'
      AND i.paid_at BETWEEN ${from} AND ${to}
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((r) => ({
    bucket: r.bucket,
    averageCents: r.average_cents == null ? null : Math.round(r.average_cents),
    invoiceCount: Number(r.invoice_count),
  }));
}
