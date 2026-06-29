import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../../shared/db/prisma";
import { BUSINESS_TIMEZONE } from "../presets";
import { assertSafeGranularity } from "../utils";
import type { Granularity } from "../presets";

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
  rate: number;
}

/**
 * Per bucket: how many distinct customers booked, split by whether their
 * Customer.createdAt falls in the SAME bucket as the appointment (new) or
 * an earlier bucket (returning).
 */
export async function getNewVsReturningCustomers(
  businessId: string,
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<NewVsReturningRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);

  const rows = await prisma.$queryRaw<
    { bucket: Date; new_customers: bigint; returning_customers: bigint }[]
  >(Prisma.sql`
    SELECT
      buckets.bucket,
      COUNT(DISTINCT CASE
        WHEN DATE_TRUNC(${safeGranularity}, c.created_at AT TIME ZONE ${BUSINESS_TIMEZONE}) = buckets.bucket
        THEN a.customer_id
      END) AS new_customers,
      COUNT(DISTINCT CASE
        WHEN DATE_TRUNC(${safeGranularity}, c.created_at AT TIME ZONE ${BUSINESS_TIMEZONE}) != buckets.bucket
        THEN a.customer_id
      END) AS returning_customers
    FROM generate_series(
      DATE_TRUNC(${safeGranularity}, ${from}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}),
      DATE_TRUNC(${safeGranularity}, ${to}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}),
      ${`1 ${safeGranularity}`}::interval
    ) AS buckets(bucket)
    LEFT JOIN appointments a
      ON DATE_TRUNC(${safeGranularity}, a.starts_at AT TIME ZONE ${BUSINESS_TIMEZONE}) = buckets.bucket
      AND a.business_id = ${businessId}::uuid
      AND a.starts_at BETWEEN ${from} AND ${to}
    LEFT JOIN customers c ON c.id = a.customer_id
    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((r) => ({
    bucket: r.bucket,
    newCustomers: Number(r.new_customers),
    returningCustomers: Number(r.returning_customers),
  }));
}

/**
 * Top customers by total paid spend in range. Needs a join for the name,
 * so this stays raw SQL rather than prisma.groupBy.
 */
export async function getCustomerLifetimeValue(
  businessId: string,
  from?: Date,
  to?: Date,
  limit = 20,
): Promise<CustomerLifetimeValueRow[]> {
  const dateFilter =
    from && to
      ? Prisma.sql`
          AND i.paid_at BETWEEN ${from} AND ${to}
        `
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
    JOIN customers c
      ON c.id = i.customer_id
    WHERE i.business_id = ${businessId}::uuid
      AND i.status = 'paid'
      ${dateFilter}
    GROUP BY c.id, c.name
    ORDER BY total_cents DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    totalCents: Number(r.total_cents),
    invoiceCount: Number(r.invoice_count),
  }));
}

/**
 * Exact-column grouping -- plain Prisma groupBy, no raw SQL needed.
 */
export async function getAcquisitionSources(
  businessId: string,
): Promise<AcquisitionSourceRow[]> {
  const rows = await prisma.customer.groupBy({
    by: ["acquisitionSource"],
    where: { businessId },
    _count: true,
  });

  return rows
    .map((r) => ({
      source: r.acquisitionSource ?? "other",
      count: r._count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Lapsed customers are NOT date-range scoped -- "lapsed" is relative to now,
 * regardless of which preset the dashboard is viewing.
 */
export async function getLapsedCustomers(
  businessId: string,
  lapsedThreshold: Date,
  limit = 10,
): Promise<LapsedCustomerRow[]> {
  const customers = await prisma.customer.findMany({
    where: { businessId, lastVisitAt: { lte: lapsedThreshold } },
    orderBy: { lastVisitAt: "asc" },
    take: limit,
    select: { id: true, name: true, lastVisitAt: true },
  });

  const now = DateTime.now().setZone(BUSINESS_TIMEZONE);
  return customers.map((c) => ({
    id: c.id,
    name: c.name,
    lastVisitAt: c.lastVisitAt,
    daysSinceLastVisit: c.lastVisitAt
      ? Math.floor(
          now.diff(
            DateTime.fromJSDate(c.lastVisitAt).setZone(BUSINESS_TIMEZONE),
            "days",
          ).days,
        )
      : 0,
  }));
}

/**
 * Retention cohorts: % of customers acquired in a given month who return
 * within 30/60/90 days. This is a per-customer date-diff against their OWN
 * createdAt, not an aggregate -- doesn't reduce to a clean GROUP BY, so it
 * stays in JS. Deliberately fetches FULL appointment history per customer,
 * not range-limited, since a customer's retention shouldn't depend on
 * which dashboard preset happens to be selected.
 */
export async function computeRetentionCohorts(
  businessId: string,
): Promise<RetentionCohortRow[]> {
  const customers = await prisma.customer.findMany({
    where: { businessId },
    select: {
      id: true,
      createdAt: true,
      appointments: { select: { startsAt: true } },
    },
  });

  const cohorts = new Map<string, RetentionCohortRow>();

  for (const customer of customers) {
    const createdLocal = DateTime.fromJSDate(customer.createdAt).setZone(
      BUSINESS_TIMEZONE,
    );
    const cohortKey = createdLocal.toFormat("yyyy-LL");

    const row = cohorts.get(cohortKey) ?? {
      cohortStart: createdLocal.startOf("month").toUTC().toJSDate(),
      totalCustomers: 0,
      retained30: 0,
      retained60: 0,
      retained90: 0,
    };
    row.totalCustomers += 1;

    const laterAppointments = customer.appointments
      .map((a) => DateTime.fromJSDate(a.startsAt).setZone(BUSINESS_TIMEZONE))
      .filter((d) => d > createdLocal);

    if (laterAppointments.some((d) => d <= createdLocal.plus({ days: 30 })))
      row.retained30 += 1;
    if (laterAppointments.some((d) => d <= createdLocal.plus({ days: 60 })))
      row.retained60 += 1;
    if (laterAppointments.some((d) => d <= createdLocal.plus({ days: 90 })))
      row.retained90 += 1;

    cohorts.set(cohortKey, row);
  }

  return Array.from(cohorts.values()).sort(
    (a, b) => a.cohortStart.getTime() - b.cohortStart.getTime(),
  );
}

export async function getNoShowRateOverTime(
  businessId: string,
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<NoShowRateRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);

  const rows = await prisma.$queryRaw<
    {
      bucket: Date;
      no_show_count: bigint;
      completed_count: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      buckets.bucket,

      COUNT(*) FILTER (
        WHERE a.status = 'no_show'
      ) AS no_show_count,

      COUNT(*) FILTER (
        WHERE a.status = 'completed'
      ) AS completed_count

    FROM generate_series(
      DATE_TRUNC(
        ${safeGranularity},
        ${from}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}
      ),
      DATE_TRUNC(
        ${safeGranularity},
        ${to}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}
      ),
      ${`1 ${safeGranularity}`}::interval
    ) AS buckets(bucket)

    LEFT JOIN appointments a
      ON DATE_TRUNC(
           ${safeGranularity},
           a.starts_at AT TIME ZONE ${BUSINESS_TIMEZONE}
         ) = buckets.bucket
      AND a.business_id = ${businessId}::uuid
      AND a.starts_at BETWEEN ${from} AND ${to}

    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((r) => {
    const noShowCount = Number(r.no_show_count);
    const completedCount = Number(r.completed_count);

    const denominator = noShowCount + completedCount;

    return {
      bucket: r.bucket,
      noShowCount,
      completedCount,
      rate: denominator === 0 ? 0 : (noShowCount / denominator) * 100,
    };
  });
}

export async function getCancellationRateOverTime(
  businessId: string,
  from: Date,
  to: Date,
  granularity: Granularity,
): Promise<CancellationRateRow[]> {
  const safeGranularity = assertSafeGranularity(granularity);

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
      buckets.bucket,

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
      DATE_TRUNC(
        ${safeGranularity},
        ${from}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}
      ),
      DATE_TRUNC(
        ${safeGranularity},
        ${to}::timestamptz AT TIME ZONE ${BUSINESS_TIMEZONE}
      ),
      ${`1 ${safeGranularity}`}::interval
    ) AS buckets(bucket)

    LEFT JOIN appointments a
      ON DATE_TRUNC(
           ${safeGranularity},
           a.starts_at AT TIME ZONE ${BUSINESS_TIMEZONE}
         ) = buckets.bucket
      AND a.business_id = ${businessId}::uuid
      AND a.starts_at BETWEEN ${from} AND ${to}

    GROUP BY buckets.bucket
    ORDER BY buckets.bucket
  `);

  return rows.map((r) => {
    const customerCancelled = Number(r.customer_cancelled);
    const businessCancelled = Number(r.business_cancelled);
    const completedCount = Number(r.completed_count);
    const noShowCount = Number(r.no_show_count);

    const totalCancelled = customerCancelled + businessCancelled;

    const denominator = totalCancelled + completedCount + noShowCount;

    return {
      bucket: r.bucket,
      customerCancelled,
      businessCancelled,
      totalCancelled,
      rate: denominator === 0 ? 0 : (totalCancelled / denominator) * 100,
    };
  });
}
