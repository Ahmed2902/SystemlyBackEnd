import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../../shared/db/prisma";
import type { Granularity } from "../periods";
import { assertSafeGranularity } from "../utils";

export interface NewVsReturningRow {
  bucket: Date;
  newCustomers: number;
  returningCustomers: number;
}

export interface CustomerLifetimeValueRow {
  id: string;
  name: string;
  totalCents: number;
  invoiceCount: number;
}

export interface AcquisitionSourceRow {
  source: string;
  count: number;
}

export interface LapsedCustomerRow {
  id: string;
  name: string;
  lastVisitAt: Date | null;
  daysSinceLastVisit: number;
}

export interface RetentionCohortRow {
  cohortStart: Date;
  totalCustomers: number;
  retained30: number;
  retained60: number;
  retained90: number;
}

export interface NoShowRateRow {
  bucket: Date;
  noShowCount: number;
  completedCount: number;
  rate: number;
}

export interface CancellationRateRow {
  bucket: Date;
  customerCancelled: number;
  businessCancelled: number;
  totalCancelled: number;
  completedCount: number;
  noShowCount: number;
  rate: number;
}

export async function getNewVsReturningCustomers(
  businessId: string,
  from: Date,
  toExclusive: Date,
  granularity: Granularity,
  timezone: string,
  branchId?: string,
): Promise<NewVsReturningRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);
  const branchFilter = branchId
    ? Prisma.sql`AND a.branch_id = ${branchId}::uuid`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { bucket: Date; new_customers: bigint; returning_customers: bigint }[]
  >(Prisma.sql`
    SELECT
      buckets.bucket AT TIME ZONE ${timezone} AS bucket,
      COUNT(DISTINCT CASE
        WHEN DATE_TRUNC(
          ${safeGranularity},
          c.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}
        ) = buckets.bucket
        THEN a.customer_id
      END) AS new_customers,
      COUNT(DISTINCT CASE
        WHEN DATE_TRUNC(
          ${safeGranularity},
          c.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}
        ) != buckets.bucket
        THEN a.customer_id
      END) AS returning_customers
    FROM generate_series(
      DATE_TRUNC(${safeGranularity}, ${from}::timestamptz AT TIME ZONE ${timezone}),
      DATE_TRUNC(
        ${safeGranularity},
        (${toExclusive}::timestamptz - INTERVAL '1 microsecond') AT TIME ZONE ${timezone}
      ),
      ${`1 ${safeGranularity}`}::interval
    ) AS buckets(bucket)
    LEFT JOIN appointments a
      ON DATE_TRUNC(
           ${safeGranularity},
           a.starts_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}
         ) = buckets.bucket
      AND a.business_id = ${businessId}::uuid
      ${branchFilter}
      AND a.starts_at >= ${from}
      AND a.starts_at < ${toExclusive}
    LEFT JOIN customers c ON c.id = a.customer_id
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((row) => ({
    bucket: row.bucket,
    newCustomers: Number(row.new_customers),
    returningCustomers: Number(row.returning_customers),
  }));
}

export async function getCustomerLifetimeValue(
  businessId: string,
  from?: Date,
  toExclusive?: Date,
  limit = 20,
  branchId?: string,
): Promise<CustomerLifetimeValueRow[]> {
  const dateFilter =
    from && toExclusive
      ? Prisma.sql`
          AND i.paid_at >= ${from}
          AND i.paid_at < ${toExclusive}
        `
      : Prisma.empty;
  const branchFilter = branchId
    ? Prisma.sql`AND i.branch_id = ${branchId}::uuid`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    { id: string; name: string; total_cents: bigint; invoice_count: bigint }[]
  >(Prisma.sql`
    SELECT
      c.id,
      c.name,
      SUM(i.total_cents) AS total_cents,
      COUNT(*) AS invoice_count
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.business_id = ${businessId}::uuid
      ${branchFilter}
      AND i.status = 'paid'
      ${dateFilter}
    GROUP BY c.id, c.name
    ORDER BY total_cents DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    totalCents: Number(row.total_cents),
    invoiceCount: Number(row.invoice_count),
  }));
}

export async function getAcquisitionSources(
  businessId: string,
  branchId?: string,
): Promise<AcquisitionSourceRow[]> {
  const branchFilter = branchId
    ? Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM appointments a
          WHERE a.customer_id = c.id
            AND a.business_id = ${businessId}::uuid
            AND a.branch_id = ${branchId}::uuid
        )
      `
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { source: string; count: bigint }[]
  >(Prisma.sql`
    SELECT COALESCE(c.acquisition_source, 'other') AS source,
           COUNT(DISTINCT c.id)::bigint AS count
    FROM customers c
    WHERE c.business_id = ${businessId}::uuid
      ${branchFilter}
    GROUP BY COALESCE(c.acquisition_source, 'other')
    ORDER BY count DESC
  `);
  return rows.map((row) => ({ source: row.source, count: Number(row.count) }));
}

export async function getLapsedCustomers(
  businessId: string,
  lapsedThreshold: Date,
  limit = 10,
  timezone = "Africa/Cairo",
  branchId?: string,
): Promise<LapsedCustomerRow[]> {
  if (!branchId) {
    const customers = await prisma.customer.findMany({
      where: { businessId, lastVisitAt: { lte: lapsedThreshold } },
      orderBy: { lastVisitAt: "asc" },
      take: limit,
      select: { id: true, name: true, lastVisitAt: true },
    });
    const now = DateTime.now().setZone(timezone);
    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      lastVisitAt: customer.lastVisitAt,
      daysSinceLastVisit: customer.lastVisitAt
        ? Math.floor(
            now.diff(
              DateTime.fromJSDate(customer.lastVisitAt).setZone(timezone),
              "days",
            ).days,
          )
        : 0,
    }));
  }

  const rows = await prisma.$queryRaw<
    { id: string; name: string; last_visit_at: Date }[]
  >(Prisma.sql`
    SELECT c.id, c.name, MAX(a.starts_at) AS last_visit_at
    FROM customers c
    JOIN appointments a ON a.customer_id = c.id
    WHERE c.business_id = ${businessId}::uuid
      AND a.business_id = ${businessId}::uuid
      AND a.branch_id = ${branchId}::uuid
      AND a.status = 'completed'
    GROUP BY c.id, c.name
    HAVING MAX(a.starts_at) <= ${lapsedThreshold}
    ORDER BY last_visit_at ASC
    LIMIT ${limit}
  `);
  const now = DateTime.now().setZone(timezone);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastVisitAt: row.last_visit_at,
    daysSinceLastVisit: Math.floor(
      now.diff(DateTime.fromJSDate(row.last_visit_at).setZone(timezone), "days")
        .days,
    ),
  }));
}

export async function countLapsedCustomers(
  businessId: string,
  lapsedThreshold: Date,
  branchId?: string,
) {
  if (!branchId) {
    return prisma.customer.count({
      where: { businessId, lastVisitAt: { lte: lapsedThreshold } },
    });
  }
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM (
      SELECT c.id
      FROM customers c
      JOIN appointments a ON a.customer_id = c.id
      WHERE c.business_id = ${businessId}::uuid
        AND a.business_id = ${businessId}::uuid
        AND a.branch_id = ${branchId}::uuid
        AND a.status = 'completed'
      GROUP BY c.id
      HAVING MAX(a.starts_at) <= ${lapsedThreshold}
    ) lapsed
  `);
  return Number(row?.count ?? 0);
}

export async function computeRetentionCohorts(
  businessId: string,
  timezone = "Africa/Cairo",
  branchId?: string,
): Promise<RetentionCohortRow[]> {
  const customerBranchFilter = branchId
    ? Prisma.sql`
        AND EXISTS (
          SELECT 1 FROM appointments first_branch_visit
          WHERE first_branch_visit.customer_id = c.id
            AND first_branch_visit.business_id = ${businessId}::uuid
            AND first_branch_visit.branch_id = ${branchId}::uuid
        )
      `
    : Prisma.empty;
  const retentionBranchFilter = branchId
    ? Prisma.sql`AND a.branch_id = ${branchId}::uuid`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    {
      cohort_start: Date;
      total_customers: bigint;
      retained_30: bigint;
      retained_60: bigint;
      retained_90: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      (
        DATE_TRUNC(
          'month',
          c.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}
        ) AT TIME ZONE ${timezone}
      ) AS cohort_start,
      COUNT(*) AS total_customers,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.customer_id = c.id
            AND a.business_id = ${businessId}::uuid
            ${retentionBranchFilter}
            AND a.starts_at > c.created_at
            AND a.starts_at <= c.created_at + INTERVAL '30 days'
        )
      ) AS retained_30,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.customer_id = c.id
            AND a.business_id = ${businessId}::uuid
            ${retentionBranchFilter}
            AND a.starts_at > c.created_at
            AND a.starts_at <= c.created_at + INTERVAL '60 days'
        )
      ) AS retained_60,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.customer_id = c.id
            AND a.business_id = ${businessId}::uuid
            ${retentionBranchFilter}
            AND a.starts_at > c.created_at
            AND a.starts_at <= c.created_at + INTERVAL '90 days'
        )
      ) AS retained_90
    FROM customers c
    WHERE c.business_id = ${businessId}::uuid
      ${customerBranchFilter}
    GROUP BY cohort_start
    ORDER BY cohort_start
  `);

  return rows.map((row) => ({
    cohortStart: row.cohort_start,
    totalCustomers: Number(row.total_customers),
    retained30: Number(row.retained_30),
    retained60: Number(row.retained_60),
    retained90: Number(row.retained_90),
  }));
}

async function getOutcomeRates(
  businessId: string,
  from: Date,
  toExclusive: Date,
  granularity: Granularity,
  timezone: string,
  branchId?: string,
): Promise<CancellationRateRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);
  const branchFilter = branchId
    ? Prisma.sql`AND a.branch_id = ${branchId}::uuid`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    {
      bucket: Date;
      customer_cancelled: bigint;
      business_cancelled: bigint;
      completed_count: bigint;
      no_show_count: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      buckets.bucket AT TIME ZONE ${timezone} AS bucket,
      COUNT(*) FILTER (
        WHERE a.status = 'cancelled_by_customer'
      ) AS customer_cancelled,
      COUNT(*) FILTER (
        WHERE a.status = 'cancelled_by_business'
      ) AS business_cancelled,
      COUNT(*) FILTER (
        WHERE a.status = 'completed'
      ) AS completed_count,
      COUNT(*) FILTER (
        WHERE a.status = 'no_show'
      ) AS no_show_count
    FROM generate_series(
      DATE_TRUNC(${safeGranularity}, ${from}::timestamptz AT TIME ZONE ${timezone}),
      DATE_TRUNC(
        ${safeGranularity},
        (${toExclusive}::timestamptz - INTERVAL '1 microsecond') AT TIME ZONE ${timezone}
      ),
      ${`1 ${safeGranularity}`}::interval
    ) AS buckets(bucket)
    LEFT JOIN appointments a
      ON DATE_TRUNC(
           ${safeGranularity},
           a.starts_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}
         ) = buckets.bucket
      AND a.business_id = ${businessId}::uuid
      ${branchFilter}
      AND a.starts_at >= ${from}
      AND a.starts_at < ${toExclusive}
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((row) => {
    const customerCancelled = Number(row.customer_cancelled);
    const businessCancelled = Number(row.business_cancelled);
    const completedCount = Number(row.completed_count);
    const noShowCount = Number(row.no_show_count);
    const totalCancelled = customerCancelled + businessCancelled;
    const denominator = totalCancelled + completedCount + noShowCount;

    return {
      bucket: row.bucket,
      customerCancelled,
      businessCancelled,
      totalCancelled,
      completedCount,
      noShowCount,
      rate: denominator > 0 ? (totalCancelled / denominator) * 100 : 0,
    };
  });
}

export async function getNoShowRateOverTime(
  businessId: string,
  from: Date,
  toExclusive: Date,
  granularity: Granularity,
  timezone = "Africa/Cairo",
  branchId?: string,
): Promise<NoShowRateRow[]> {
  const outcomes = await getOutcomeRates(
    businessId,
    from,
    toExclusive,
    granularity,
    timezone,
    branchId,
  );
  return outcomes.map((row) => {
    const denominator = row.noShowCount + row.completedCount;
    return {
      bucket: row.bucket,
      noShowCount: row.noShowCount,
      completedCount: row.completedCount,
      rate: denominator > 0 ? (row.noShowCount / denominator) * 100 : 0,
    };
  });
}

export function getCancellationRateOverTime(
  businessId: string,
  from: Date,
  toExclusive: Date,
  granularity: Granularity,
  timezone = "Africa/Cairo",
  branchId?: string,
): Promise<CancellationRateRow[]> {
  return getOutcomeRates(
    businessId,
    from,
    toExclusive,
    granularity,
    timezone,
    branchId,
  );
}
