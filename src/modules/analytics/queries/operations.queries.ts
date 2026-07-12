import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../../shared/db/prisma";
import { BUSINESS_TIMEZONE } from "../presets";
import { bucketLeadTimeDays, type LeadTimeBucket } from "../utils";

export interface BookingHeatmapRow {
  weekday: number; // 0 = Sunday ... 6 = Saturday
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

/**
 * Appointment volume by weekday + hour -- helps an owner see peak demand
 * windows. Plain GROUP BY, no gap-filling needed since a heatmap cell with
 * zero bookings is meaningfully different from one with one booking (the
 * frontend can render absence as 0 directly, no generate_series required).
 */
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

  return rows.map((r) => ({
    weekday: r.weekday,
    hour: r.hour,
    count: Number(r.count),
  }));
}

/**
 * Most-booked services by appointment count. Needs the service name/category
 * joined, so this stays raw SQL rather than prisma.groupBy.
 */
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

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    count: Number(r.count),
  }));
}

/**
 * Booking lead time: diff between Appointment.createdAt and startsAt,
 * bucketed into named ranges. A per-row computed-then-bucketed value,
 * not an aggregate -- stays in JS.
 */
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
  for (const appt of appointments) {
    const startsLocal = DateTime.fromJSDate(appt.startsAt).setZone(
      BUSINESS_TIMEZONE,
    );
    const createdLocal = DateTime.fromJSDate(appt.createdAt).setZone(
      BUSINESS_TIMEZONE,
    );
    const diffDays = Math.max(startsLocal.diff(createdLocal, "days").days, 0);
    const bucket = bucketLeadTimeDays(diffDays);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }

  const order: LeadTimeBucket[] = [
    "same_day",
    "1_2_days",
    "3_7_days",
    "1_week_plus",
  ];
  return order.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));
}
