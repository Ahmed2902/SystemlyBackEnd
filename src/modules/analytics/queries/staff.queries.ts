import { Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../../shared/db/prisma";

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

export async function getStaffRevenue(
  businessId: string,
  from: Date,
  toExclusive: Date,
  branchId?: string,
): Promise<StaffRevenueRow[]> {
  const branchFilter = branchId
    ? Prisma.sql`AND i.branch_id = ${branchId}::uuid`
    : Prisma.empty;
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
      ${branchFilter}
      AND i.status = 'paid'
      AND i.paid_at >= ${from}
      AND i.paid_at < ${toExclusive}
      AND li.staff_id IS NOT NULL
    GROUP BY st.id, st.name
    ORDER BY total_cents DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    totalCents: Number(row.total_cents),
    commissionEarnedCents: Number(row.commission_earned_cents),
    lineItemCount: Number(row.line_item_count),
  }));
}

export async function computeStaffUtilization(
  businessId: string,
  from: Date,
  toExclusive: Date,
  timezone: string,
  branchId?: string,
): Promise<StaffUtilizationRow[]> {
  const localFrom = DateTime.fromJSDate(from).setZone(timezone);
  const localToExclusive = DateTime.fromJSDate(toExclusive).setZone(timezone);
  const rangeStartDate = new Date(`${localFrom.toISODate()}T00:00:00.000Z`);
  const rangeEndDate = new Date(
    `${localToExclusive.minus({ milliseconds: 1 }).toISODate()}T00:00:00.000Z`,
  );
  const staffWhere = {
    businessId,
    ...(branchId ? { branchId } : {}),
  };

  const [staff, availability, overrides, segmentsInRange] = await Promise.all([
    prisma.staff.findMany({
      where: staffWhere,
      select: { id: true, name: true, isActive: true },
    }),
    prisma.availability.findMany({
      where: { staff: staffWhere },
      select: {
        staffId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        breakAfterMin: true,
      },
    }),
    prisma.availabilityOverride.findMany({
      where: {
        staff: staffWhere,
        overrideDate: { gte: rangeStartDate, lte: rangeEndDate },
      },
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
        appointment: {
          businessId,
          ...(branchId ? { branchId } : {}),
        },
        startsAt: { gte: from, lt: toExclusive },
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
  for (const segment of segmentsInRange) {
    if (NON_BILLABLE_STATUSES.includes(segment.appointment.status)) continue;
    const minutes = Math.max(
      Math.round(
        (segment.endsAt.getTime() - segment.startsAt.getTime()) / 60_000,
      ),
      0,
    );
    bookedMinutesByStaff.set(
      segment.staffId,
      (bookedMinutesByStaff.get(segment.staffId) ?? 0) + minutes,
    );
  }

  const availabilityByStaff = new Map<string, typeof availability>();
  for (const row of availability) {
    const list = availabilityByStaff.get(row.staffId) ?? [];
    list.push(row);
    availabilityByStaff.set(row.staffId, list);
  }

  const overridesByStaffAndDate = new Map<string, (typeof overrides)[number]>();
  for (const row of overrides) {
    const date = DateTime.fromJSDate(row.overrideDate)
      .setZone(timezone)
      .toISODate();
    overridesByStaffAndDate.set(`${row.staffId}:${date}`, row);
  }

  const days: DateTime[] = [];
  for (
    let cursor = localFrom.startOf("day");
    cursor < localToExclusive;
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
    let total = 0;

    for (const day of days) {
      const isoDay = day.toISODate();
      const override = overridesByStaffAndDate.get(`${member.id}:${isoDay}`);
      if (override?.isDayOff) continue;

      if (override?.startTime && override.endTime) {
        const start = DateTime.fromJSDate(override.startTime).setZone(timezone);
        const end = DateTime.fromJSDate(override.endTime).setZone(timezone);
        total += Math.max(Math.round(end.diff(start, "minutes").minutes), 0);
        continue;
      }

      const rows = staffAvailability.filter(
        (entry) => entry.dayOfWeek === day.weekday % 7,
      );
      for (const row of rows) {
        const start = DateTime.fromJSDate(row.startTime).setZone(timezone);
        const end = DateTime.fromJSDate(row.endTime).setZone(timezone);
        total += Math.max(
          Math.round(end.diff(start, "minutes").minutes) -
            (row.breakAfterMin ?? 0),
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
