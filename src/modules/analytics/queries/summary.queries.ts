import { Prisma } from "@prisma/client";
import { prisma } from "../../../shared/db/prisma";

export interface CustomerRangeSummary {
  activeCustomers: number;
  newCustomers: number;
  returningCustomers: number;
}

export interface CustomItemRevenueRow {
  description: string;
  quantity: number;
  totalCents: number;
}

export async function getCustomerRangeSummary(
  businessId: string,
  from: Date,
  toExclusive: Date,
): Promise<CustomerRangeSummary> {
  const [row] = await prisma.$queryRaw<
    {
      active_customers: bigint;
      new_customers: bigint;
      returning_customers: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      COUNT(DISTINCT a.customer_id) AS active_customers,
      COUNT(DISTINCT CASE
        WHEN c.created_at >= ${from} AND c.created_at < ${toExclusive}
        THEN a.customer_id
      END) AS new_customers,
      COUNT(DISTINCT CASE
        WHEN c.created_at < ${from} THEN a.customer_id
      END) AS returning_customers
    FROM appointments a
    JOIN customers c ON c.id = a.customer_id
    WHERE a.business_id = ${businessId}::uuid
      AND a.starts_at >= ${from}
      AND a.starts_at < ${toExclusive}
  `);

  return {
    activeCustomers: Number(row?.active_customers ?? 0),
    newCustomers: Number(row?.new_customers ?? 0),
    returningCustomers: Number(row?.returning_customers ?? 0),
  };
}

export async function getCustomItemRevenue(
  businessId: string,
  from: Date,
  toExclusive: Date,
  limit = 12,
): Promise<CustomItemRevenueRow[]> {
  const rows = await prisma.$queryRaw<
    { description: string; quantity: bigint; total_cents: bigint }[]
  >(Prisma.sql`
    SELECT
      li.description,
      SUM(li.quantity)::bigint AS quantity,
      SUM(li.total_cents)::bigint AS total_cents
    FROM invoice_line_items li
    JOIN invoices i ON i.id = li.invoice_id
    WHERE i.business_id = ${businessId}::uuid
      AND i.status = 'paid'
      AND i.paid_at >= ${from}
      AND i.paid_at < ${toExclusive}
      AND li.service_id IS NULL
    GROUP BY li.description
    ORDER BY total_cents DESC, li.description ASC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    description: row.description,
    quantity: Number(row.quantity),
    totalCents: Number(row.total_cents),
  }));
}
