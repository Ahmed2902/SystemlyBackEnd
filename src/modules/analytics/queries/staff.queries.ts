import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../../shared/db/prisma";
import { BUSINESS_TIMEZONE } from "../presets";

export interface StaffRevenueRow {
  id: string;
  name: string;
  totalCents: number;
  commissionEarnedCents: number;
  lineItemCount: number;
}

export interface StaffUtilizationRow {
  id: string;
  name: string;
  bookedMinutes: number;
  availableMinutes: number;
}

const NON_BILLABLE_STATUSES = [
  "cancelled_by_customer",
  "cancelled_by_business",
  "no_show",
];

/**
 * Revenue + commission generated per staff member, from InvoiceLineItem.
 * Exact-column grouping by staffId -- still raw SQL only because we need
 * the staff name attached via join; otherwise this would be a plain
 * prisma.groupBy.
 */
export async function getStaffRevenue(
  businessId: string,
  from: Date,
  to: Date,
): Promise<StaffRevenueRow[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      total_cents: bigint;
      commission_earned_cents: bigint;
      line_item_count: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      st.id,
      st.name,
      SUM(li.total_cents) AS total_cents,
      COALESCE(SUM(li.commission_earned_cents), 0) AS commission_earned_cents,
      COUNT(*) AS line_item_count
    FROM invoice_line_items li
    JOIN invoices i ON i.id = li.invoice_id
    JOIN staff st ON st.id = li.staff_id
    WHERE i.business_id = ${businessId}::uuid
      AND i.status = 'paid'
      AND i.paid_at BETWEEN ${from} AND ${to}
      AND li.staff_id IS NOT NULL
    GROUP BY st.id, st.name
    ORDER BY total_cents DESC
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    totalCents: Number(r.total_cents),
    commissionEarnedCents: Number(r.commission_earned_cents),
    lineItemCount: Number(r.line_item_count),
  }));
}

/**
 * Booked vs available minutes per staff member. This walks day-by-day
 * through the range checking Availability against AvailabilityOverride
 * (day-offs, custom hours) -- not expressible as a clean GROUP BY, so it
 * stays as a dedicated JS computation rather than raw SQL.
 */
export async function computeStaffUtilization(
  businessId: string,
  from: Date,
  to: Date,
): Promise<StaffUtilizationRow[]> {
  const [staff, availability, overrides, segmentsInRange] = await Promise.all([
    prisma.staff.findMany({
      where: { businessId },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.availability.findMany({
      where: { staff: { businessId } },
      select: {
        staffId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        breakAfterMin: true,
      },
    }),
    prisma.availabilityOverride.findMany({
      where: { staff: { businessId } },
      select: {
        staffId: true,
        overrideDate: true,
        isDayOff: true,
        startTime: true,
        endTime: true,
      },
    }),
    prisma.appointmentService.findMany({
      where: {
        appointment: { businessId },
        startsAt: { gte: from, lte: to },
      },
      select: {
        staffId: true,
        startsAt: true,
        endsAt: true,
        appointment: { select: { status: true } },
      },
    }),
  ]);

  const bookedMinutesByStaff = new Map<string, number>();
  for (const seg of segmentsInRange) {
    if (NON_BILLABLE_STATUSES.includes(seg.appointment.status)) continue;
    const minutes = Math.max(
      Math.round((seg.endsAt.getTime() - seg.startsAt.getTime()) / 60000),
      0,
    );
    bookedMinutesByStaff.set(
      seg.staffId,
      (bookedMinutesByStaff.get(seg.staffId) ?? 0) + minutes,
    );
  }

  // availabilityByStaff / overridesByStaff / days / availableMinutesByStaff
  // loop below is UNCHANGED — it's schedule-based, not appointment-based.

  const availabilityByStaff = new Map<string, typeof availability>();
  for (const row of availability) {
    const list = availabilityByStaff.get(row.staffId) ?? [];
    list.push(row);
    availabilityByStaff.set(row.staffId, list);
  }

  const overridesByStaff = new Map<string, typeof overrides>();
  for (const row of overrides) {
    const list = overridesByStaff.get(row.staffId) ?? [];
    list.push(row);
    overridesByStaff.set(row.staffId, list);
  }

  const days: DateTime[] = [];
  for (
    let cursor = DateTime.fromJSDate(from)
      .setZone(BUSINESS_TIMEZONE)
      .startOf("day");
    cursor <= DateTime.fromJSDate(to).setZone(BUSINESS_TIMEZONE).endOf("day");
    cursor = cursor.plus({ days: 1 })
  ) {
    days.push(cursor);
  }

  const availableMinutesByStaff = new Map<string, number>();
  for (const member of staff) {
    if (!member.isActive) {
      availableMinutesByStaff.set(member.id, 0);
      continue;
    }

    const staffAvailability = availabilityByStaff.get(member.id) ?? [];
    const staffOverrides = overridesByStaff.get(member.id) ?? [];

    let total = 0;
    for (const day of days) {
      const isoDay = day.toISODate();
      const override = staffOverrides.find(
        (entry) =>
          DateTime.fromJSDate(entry.overrideDate)
            .setZone(BUSINESS_TIMEZONE)
            .toISODate() === isoDay,
      );
      if (override?.isDayOff) continue;

      if (override?.startTime && override?.endTime) {
        const start = DateTime.fromJSDate(override.startTime).setZone(
          BUSINESS_TIMEZONE,
        );
        const end = DateTime.fromJSDate(override.endTime).setZone(
          BUSINESS_TIMEZONE,
        );
        total += Math.max(Math.round(end.diff(start, "minutes").minutes), 0);
        continue;
      }

      const rows = staffAvailability.filter(
        (entry) => entry.dayOfWeek === day.weekday % 7,
      );
      for (const row of rows) {
        const start = DateTime.fromJSDate(row.startTime).setZone(
          BUSINESS_TIMEZONE,
        );
        const end = DateTime.fromJSDate(row.endTime).setZone(BUSINESS_TIMEZONE);
        const breakAfterMin = row.breakAfterMin ?? 0;
        total += Math.max(
          Math.round(end.diff(start, "minutes").minutes) - breakAfterMin,
          0,
        );
      }
    }
    availableMinutesByStaff.set(member.id, total);
  }

  return staff.map((member) => ({
    id: member.id,
    name: member.name,
    bookedMinutes: bookedMinutesByStaff.get(member.id) ?? 0,
    availableMinutes: availableMinutesByStaff.get(member.id) ?? 0,
  }));
}
