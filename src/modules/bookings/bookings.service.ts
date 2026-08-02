import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import { createAppointmentCore } from "../../shared/services/scheduling/appointment-core.service";
import { buildAvailabilitySlots } from "../../shared/services/scheduling/availability-slots.service";
import { notFoundError } from "../appointments/appointments.helper";
import {
  findPublicBusinessGateById,
  requirePublicFeature,
} from "../subscriptions/public-subscription-access.service";
import { ENTITLEMENTS } from "../subscriptions/subscription.catalog";
import type { AvailabilityQuery, CreateBookingBody } from "./bookings.schema";

const CANCEL_TTL_DAYS = parseInt(
  process.env.BOOKING_CANCEL_TTL_DAYS || "30",
  10,
);

async function requireBookableBusiness(businessId: string) {
  const business = await findPublicBusinessGateById(businessId);
  if (!business) throw notFoundError("Business not found");
  return requirePublicFeature(business, ENTITLEMENTS.ONLINE_BOOKING);
}

class BookingsService {
  async getAvailability(opts: AvailabilityQuery) {
    const { businessId, services: selections, date, timezone } = opts;
    const business = await requireBookableBusiness(businessId);
    const effectiveTimezone = timezone || business.timezone || "UTC";

    return buildAvailabilitySlots({
      businessId,
      date,
      timezone: effectiveTimezone,
      selections,
    });
  }

  getByCancelToken(token: string) {
    return prisma.appointment.findUnique({
      where: { cancelToken: token } as any,
    });
  }

  async cancelByToken(token: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { cancelToken: token } as any,
      include: { customer: true },
    });
    if (!appointment) {
      const error = new Error("Not found") as Error & {
        statusCode?: number;
      };
      error.statusCode = 404;
      throw error;
    }

    const createdAt = DateTime.fromJSDate(appointment.createdAt, {
      zone: "utc",
    });
    if (
      createdAt.plus({ days: CANCEL_TTL_DAYS }).toMillis() <
      DateTime.utc().toMillis()
    ) {
      const error = new Error("Cancel link expired") as Error & {
        statusCode?: number;
      };
      error.statusCode = 410;
      throw error;
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: "cancelled_by_customer" } as any,
      });

      if (
        appointment.customerId &&
        appointment.customer &&
        appointment.customer.visitCount > 0
      ) {
        await tx.customer.update({
          where: { id: appointment.customerId },
          data: { visitCount: { decrement: 1 } },
        });
      }

      return updated;
    });
  }

  async createBooking(payload: CreateBookingBody) {
    const { businessId, services: selections, startsAt, timezone } = payload;
    await requireBookableBusiness(businessId);

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
