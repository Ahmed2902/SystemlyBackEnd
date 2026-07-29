import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import type { AvailabilityQuery, CreateBookingBody } from "./bookings.schema";
import { buildAvailabilitySlots } from "../../shared/services/scheduling/availability-slots.service";
import { createAppointmentCore } from "../../shared/services/scheduling/appointment-core.service";
import { notFoundError } from "../appointments/appointments.helper";

const CANCEL_TTL_DAYS = parseInt(
  process.env.BOOKING_CANCEL_TTL_DAYS || "30",
  10,
);

class BookingsService {
  async getAvailability(opts: AvailabilityQuery) {
    const { businessId, services: selections, date, timezone } = opts;

    const business = timezone
      ? null
      : await prisma.business.findUnique({
          where: { id: businessId },
          select: { timezone: true },
        });
    const tz = timezone || business?.timezone || "UTC";

    return buildAvailabilitySlots({
      businessId,
      date,
      timezone: tz,
      selections,
    });
  }

  async getByCancelToken(token: string) {
    return prisma.appointment.findUnique({
      where: { cancelToken: token } as any,
    });
  }

  async cancelByToken(token: string) {
    const appt = await prisma.appointment.findUnique({
      where: { cancelToken: token } as any,
      include: { customer: true },
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

    return prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appt.id },
        data: { status: "cancelled_by_customer" } as any,
      });

      if (appt.customerId && appt.customer && appt.customer.visitCount > 0) {
        await tx.customer.update({
          where: { id: appt.customerId },
          data: { visitCount: { decrement: 1 } },
        });
      }

      return updated;
    });
  }

  async createBooking(payload: CreateBookingBody) {
    const { businessId, services: selections, startsAt, timezone } = payload;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) throw notFoundError("Business not found");

    return prisma.$transaction((tx) =>
      createAppointmentCore(tx, business, {
        businessId,
        selections,
        startsAt,
        timezone,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        notes: payload.notes,
        bookingChannel: "WEBSITE",
        acquisitionSource: payload.acquisitionSource,
        status: "pending",
        generateToken: true,
      }),
    );
  }
}

const bookingsService = new BookingsService();
export default bookingsService;
