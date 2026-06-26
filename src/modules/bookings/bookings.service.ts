import { prisma } from "../../shared/db/prisma";
import { generateSlots } from "../../shared/utils/slots.util";
import { DateTime } from "luxon";
import { upsertByPhone as upsertCustomer } from "../customers/customers.service";
import { generateCancelToken } from "../../shared/utils/token.util";
import type { AvailabilityQuery, CreateBookingBody } from "./bookings.schema";
import type { Slot } from "../../shared/utils/slots.util";
import {
  getBusinessDayOfWeek,
  getBusinessDayRange,
  toBusinessTime,
  toUtcFromBusinessTime,
} from "../../shared/utils/timezone";

const CANCEL_TTL_DAYS = parseInt(
  process.env.BOOKING_CANCEL_TTL_DAYS || "30",
  10,
);

class BookingsService {
  async getAvailability(opts: AvailabilityQuery) {
    const { businessId, serviceId, staffId, date, timezone = undefined } = opts;

    const [business, service] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
      }),
      prisma.service.findUnique({
        where: { id: serviceId },
      }),
    ]);

    if (!service) {
      throw new Error("Service not found");
    }

    const tz = timezone || (business?.timezone as string) || "UTC";

    let staffIds: string[] = [];

    if (staffId) {
      staffIds = [staffId];
    } else {
      const rows = await prisma.serviceStaff.findMany({
        where: { serviceId },
        include: {
          staff: true,
        },
      });

      staffIds = rows.filter((r) => r.staff?.isActive).map((r) => r.staffId);
    }

    if (staffIds.length === 0) {
      return [];
    }

    const dayOfWeek = getBusinessDayOfWeek(date, tz);

    const { start: dayStart, end: dayEnd } = getBusinessDayRange(tz, date);

    const [overrides, availabilities, appointments] = await Promise.all([
      prisma.availabilityOverride.findMany({
        where: {
          staffId: {
            in: staffIds,
          },
          overrideDate: new Date(date),
        },
      }),

      prisma.availability.findMany({
        where: {
          staffId: {
            in: staffIds,
          },
          dayOfWeek,
        },
      }),

      prisma.appointment.findMany({
        where: {
          businessId,
          staffId: {
            in: staffIds,
          },
          status: {
            notIn: ["cancelled_by_customer", "cancelled_by_business"],
          },
          AND: [
            {
              startsAt: {
                lt: dayEnd,
              },
            },
            {
              endsAt: {
                gt: dayStart,
              },
            },
          ],
        },
      }),
    ]);

    const overrideMap = new Map(overrides.map((o) => [o.staffId, o]));

    const availabilityMap = new Map(availabilities.map((a) => [a.staffId, a]));

    const appointmentsMap = new Map<string, typeof appointments>();

    for (const appt of appointments) {
      const arr = appointmentsMap.get(appt.staffId) ?? [];

      arr.push(appt);

      appointmentsMap.set(appt.staffId, arr);
    }

    const allSlots: Slot[] = [];

    for (const sId of staffIds) {
      const override = overrideMap.get(sId);

      if (override?.isDayOff) {
        continue;
      }

      const avail = availabilityMap.get(sId);

      let startTimeStr: string | undefined;
      let endTimeStr: string | undefined;
      let breakAfterMin = 0;

      if (override?.startTime && override?.endTime) {
        startTimeStr = toBusinessTime(override.startTime, tz).toFormat("HH:mm");

        endTimeStr = toBusinessTime(override.endTime, tz).toFormat("HH:mm");
      } else if (avail) {
        startTimeStr = toBusinessTime(avail.startTime, tz).toFormat("HH:mm");

        endTimeStr = toBusinessTime(avail.endTime, tz).toFormat("HH:mm");

        breakAfterMin = avail.breakAfterMin ?? 0;
      } else {
        continue;
      }

      const staffAppointments = appointmentsMap.get(sId) ?? [];

      const bookedSlots = staffAppointments.map((a) => ({
        starts_at: a.startsAt,
        ends_at: a.endsAt,
      }));

      const slots = generateSlots({
        date,
        startTime: startTimeStr,
        endTime: endTimeStr,
        durationMin: service.durationMin,
        breakAfterMin,
        bookedSlots,
        staffId: sId,
        timezone: tz,
        slotIntervalMin: 15,
      });

      allSlots.push(...slots);
    }

    const map: Record<string, Slot> = {};

    for (const slot of allSlots) {
      map[slot.time] = slot;
    }

    return Object.values(map).sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
  }

  async getByCancelToken(token: string) {
    return prisma.appointment.findUnique({
      where: { cancelToken: token } as any,
    });
  }

  async cancelByToken(token: string) {
    const appt = await prisma.appointment.findUnique({
      where: { cancelToken: token } as any,
    });
    if (!appt) {
      const err: any = new Error("Not found");
      err.statusCode = 404;
      throw err;
    }

    const createdAt = DateTime.fromJSDate(appt.createdAt, { zone: "utc" });
    if (
      createdAt.plus({ days: CANCEL_TTL_DAYS }).toMillis() <
      DateTime.utc().toMillis()
    ) {
      const err: any = new Error("Cancel link expired");
      err.statusCode = 410;
      throw err;
    }

    const updated = await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: "cancelled_by_customer" } as any,
    });
    return updated;
  }

  async createBooking(payload: CreateBookingBody) {
    const {
      businessId,
      serviceId,
      staffId: requestedStaffId,
      startsAt,
      timezone,
    } = payload;
    const tz =
      timezone ||
      (await prisma.business.findUnique({ where: { id: businessId } }))
        ?.timezone ||
      "UTC";

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service) {
      const err: any = new Error("Service not found");
      err.statusCode = 404;
      throw err;
    }

    let staffId = requestedStaffId;
    if (!staffId) {
      const rows = await prisma.serviceStaff.findMany({
        where: { serviceId },
        include: { staff: true },
      });
      const candidates = rows
        .filter((r) => r.staff?.isActive)
        .map((r) => r.staffId);
      if (candidates.length === 0) {
        const err: any = new Error("No staff available for this service");
        err.statusCode = 400;
        throw err;
      }

      const { start: dayStart, end: dayEnd } = getBusinessDayRange(
        tz,
        startsAt,
      );
      let best: { id: string; count: number } | null = null;
      for (const c of candidates) {
        const cnt = await prisma.appointment.count({
          where: {
            staffId: c,
            businessId,
            status: {
              notIn: ["cancelled_by_customer", "cancelled_by_business"],
            },
            AND: [{ startsAt: { lt: dayEnd } }, { endsAt: { gt: dayStart } }],
          },
        });
        if (!best || cnt < best.count) best = { id: c, count: cnt };
      }
      staffId = best!.id;
    }

    return prisma.$transaction(async (tx) => {
      const svc = await tx.service.findUnique({ where: { id: serviceId } });
      const starts = /(?:Z|[+-]\d\d:\d\d)$/.test(startsAt)
        ? new Date(startsAt)
        : toUtcFromBusinessTime(startsAt, tz);
      const ends = new Date(starts.getTime() + svc!.durationMin * 60 * 1000);

      const conflict = await tx.appointment.findFirst({
        where: {
          staffId,
          status: { notIn: ["cancelled_by_customer", "cancelled_by_business"] },
          AND: [{ startsAt: { lt: ends } }, { endsAt: { gt: starts } }],
        },
      });

      if (conflict) {
        const err: any = new Error(
          "This slot was just taken. Please pick another time.",
        );
        err.statusCode = 409;
        err.code = "SLOT_TAKEN";
        throw err;
      }

      const customer = await upsertCustomer(
        businessId,
        payload.customerPhone,
        payload.customerName,
        payload.acquisitionSource,
      );

      const appt = await tx.appointment.create({
        data: {
          businessId,
          staffId,
          serviceId,
          customerId: customer.id,
          startsAt: starts,
          endsAt: ends,
          status: "pending",
          cancelToken: generateCancelToken(),
          notes: payload.notes || null,
        } as any,
      });

      return { appointment: appt, customer };
    });
  }
}

const bookingsService = new BookingsService();

export default bookingsService;
