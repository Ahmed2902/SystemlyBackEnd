import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../../shared/db/prisma";
import { BUSINESS_TIMEZONE } from "../presets";
import { bucketLeadTimeDays, type LeadTimeBucket } from "../utils";

export interface BookingHeatmapRow {
  weekday: number;
  hour: number;
  count: number;
}

export interface MostBookedServiceRow {
  id: string;
  name: string;
  category: string;
  count: number;
}

export interface BookingLeadTimeRow {
  bucket: LeadTimeBucket;
  count: number;
}

export async function getBookingHeatmap(
  businessId: string,
  from: Date,
  to: Date,
): Promise<BookingHeatmapRow[]> {
  const rows = await prisma.$queryRaw<
    { weekday: number; hour: number; count: bigint }[]
  >(Prisma.sql`
    SELECT
      EXTRACT(DOW FROM a.starts_at AT TIME ZONE ${BUSINESS_TIMEZONE})::int AS weekday,
      EXTRACT(HOUR FROM a.starts_at AT TIME ZONE ${BUSINESS_TIMEZONE})::int AS hour,
      COUNT(*) AS count
    FROM appointments a
    WHERE a.business_id = ${businessId}::uuid
      AND a.starts_at BETWEEN ${from} AND ${to}
    GROUP BY weekday, hour
    ORDER BY weekday, hour
  `);

  return rows.map((row) => ({
    weekday: row.weekday,
    hour: row.hour,
    count: Number(row.count),
  }));
}

export async function getMostBookedServices(
  businessId: string,
  from: Date,
  to: Date,
  limit = 10,
): Promise<MostBookedServiceRow[]> {
  const rows = await prisma.$queryRaw<
    { id: string; name: string; category: string; count: bigint }[]
  >(Prisma.sql`
    SELECT
      s.id,
      s.name,
      COALESCE(s.category, 'uncategorized') AS category,
      COUNT(*) AS count
    FROM appointment_services aps
    JOIN appointments a ON a.id = aps.appointment_id
    JOIN services s ON s.id = aps.service_id
    WHERE a.business_id = ${businessId}::uuid
      AND aps.starts_at BETWEEN ${from} AND ${to}
    GROUP BY s.id, s.name, s.category
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    count: Number(row.count),
  }));
}

export async function computeBookingLeadTimes(
  businessId: string,
  from: Date,
  to: Date,
): Promise<BookingLeadTimeRow[]> {
  const appointments = await prisma.appointment.findMany({
    where: { businessId, startsAt: { gte: from, lte: to } },
    select: { startsAt: true, createdAt: true },
  });

  const counts = new Map<LeadTimeBucket, number>();
  for (const appointment of appointments) {
    const startsLocal = DateTime.fromJSDate(appointment.startsAt).setZone(
      BUSINESS_TIMEZONE,
    );
    const createdLocal = DateTime.fromJSDate(appointment.createdAt).setZone(
      BUSINESS_TIMEZONE,
    );
    const diffDays = Math.max(startsLocal.diff(createdLocal, "days").days, 0);
    const bucket = bucketLeadTimeDays(diffDays);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const order: LeadTimeBucket[] = [
    "same_day",
    "1_3_days",
    "4_7_days",
    "8_14_days",
    "15_plus_days",
  ];

  return order.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}
