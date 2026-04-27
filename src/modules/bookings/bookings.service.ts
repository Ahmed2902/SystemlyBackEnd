import { prisma } from "../../shared/db/prisma";
import { generateSlots } from "../../shared/utils/slots.util";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { upsertByPhone as upsertCustomer } from "../customers/customers.service";
import { generateCancelToken } from "../../shared/utils/token.util";
import type { AvailabilityQuery, CreateBookingBody } from "./bookings.schema";
import type { Slot } from "../../shared/utils/slots.util";

dayjs.extend(utc);
dayjs.extend(timezone);

const CANCEL_TTL_DAYS = parseInt(
  process.env.BOOKING_CANCEL_TTL_DAYS || "30",
  10
);

class BookingsService {
  async getAvailability(opts: AvailabilityQuery) {
    const { businessId, serviceId, staffId, date, timezone = undefined } = opts;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    const tz = timezone || (business?.timezone as string) || "UTC";

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });
    if (!service) throw new Error("Service not found");

    let staffIds: string[] = [];
    if (staffId) staffIds = [staffId];
    else {
      const rows = await prisma.serviceStaff.findMany({
        where: { serviceId },
        include: { staff: true },
      });
      staffIds = rows.filter((r) => r.staff?.isActive).map((r) => r.staffId);
    }

    const allSlots: Slot[] = [];

    for (const sId of staffIds) {
      const override = await prisma.availabilityOverride.findFirst({
        where: { staffId: sId, overrideDate: new Date(date) },
      });

      const dayOfWeek = dayjs.tz(date, tz).day();
      const avail = await prisma.availability.findFirst({
        where: { staffId: sId, dayOfWeek },
      });

      if (override && override.isDayOff) continue;

      let startTimeStr: string | undefined;
      let endTimeStr: string | undefined;
      let breakAfterMin = 0;

      if (override && override.startTime && override.endTime) {
        startTimeStr = dayjs(override.startTime).tz(tz).format("HH:mm");
        endTimeStr = dayjs(override.endTime).tz(tz).format("HH:mm");
      } else if (avail) {
        startTimeStr = dayjs(avail.startTime).tz(tz).format("HH:mm");
        endTimeStr = dayjs(avail.endTime).tz(tz).format("HH:mm");
        breakAfterMin = avail.breakAfterMin ?? 0;
      } else {
        continue;
      }

      const dayStart = dayjs.tz(date, tz).startOf("day").toDate();
      const dayEnd = dayjs.tz(date, tz).endOf("day").toDate();

      const appointments = await prisma.appointment.findMany({
        where: {
          staffId: sId,
          businessId,
          status: { notIn: ["cancelled_by_customer", "cancelled_by_business"] },
          AND: [{ startsAt: { lt: dayEnd } }, { endsAt: { gt: dayStart } }],
        },
      });

      const bookedSlots = appointments.map((a) => ({
        starts_at: a.startsAt,
        ends_at: a.endsAt,
      }));

      const slots = generateSlots({
        date,
        startTime: startTimeStr as string,
        endTime: endTimeStr as string,
        durationMin: service.durationMin,
        breakAfterMin,
        bookedSlots,
        staffId: sId,
        timezone: tz,
      });

      allSlots.push(...slots);
    }

    const map: Record<string, Slot> = {};
    for (const s of allSlots) map[s.time] = s;
    const uniq = Object.values(map).sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    return uniq;
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

    const createdAt = dayjs(appt.createdAt);
    if (createdAt.add(CANCEL_TTL_DAYS, "day").isBefore(dayjs())) {
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

      const dayStart = dayjs.tz(startsAt, tz).startOf("day").toDate();
      const dayEnd = dayjs.tz(startsAt, tz).endOf("day").toDate();
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
      const starts = dayjs.tz(startsAt, tz);
      const ends = starts.add(svc!.durationMin, "minute");

      const conflict = await tx.appointment.findFirst({
        where: {
          staffId,
          status: { notIn: ["cancelled_by_customer", "cancelled_by_business"] },
          AND: [
            { startsAt: { lt: ends.toDate() } },
            { endsAt: { gt: starts.toDate() } },
          ],
        },
      });

      if (conflict) {
        const err: any = new Error(
          "This slot was just taken. Please pick another time."
        );
        err.statusCode = 409;
        err.code = "SLOT_TAKEN";
        throw err;
      }

      const customer = await upsertCustomer(
        businessId,
        payload.customerPhone,
        payload.customerName
      );

      const appt = await tx.appointment.create({
        data: {
          businessId,
          staffId,
          serviceId,
          customerId: customer.id,
          startsAt: starts.toDate(),
          endsAt: ends.toDate(),
          status: "pending",
          cancelToken: generateCancelToken(),
          notes: payload.notes || null,
        } as any,
      });

      return { appointment: appt, customer };
    });
  }
}

export default new BookingsService();
