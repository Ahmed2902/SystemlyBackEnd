import { AppointmentStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { createAppointmentCore } from "../../shared/services/scheduling/appointment-core.service";
import { buildAvailabilitySlots } from "../../shared/services/scheduling/availability-slots.service";
import {
  invalidStateError,
  notFoundError,
} from "../appointments/appointments.helper";
import {
  findPublicBusinessGateById,
  requirePublicFeature,
} from "../subscriptions/public-subscription-access.service";
import { ENTITLEMENTS } from "../subscriptions/subscription.catalog";
import type { AvailabilityQuery, CreateBookingBody } from "./bookings.schema";

async function requireBookableBusiness(businessId: string) {
  const business = await findPublicBusinessGateById(businessId);
  if (!business) throw notFoundError("Business not found");
  return requirePublicFeature(business, ENTITLEMENTS.ONLINE_BOOKING);
}

class BookingsService {
  async getAvailability(opts: AvailabilityQuery) {
    const { businessId, services: selections, date } = opts;
    const business = await requireBookableBusiness(businessId);
    const timezone = business.timezone || "UTC";

    return buildAvailabilitySlots({
      businessId,
      date,
      timezone,
      selections,
    });
  }

  async cancelByToken(token: string) {
    return prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { cancelToken: token },
      });
      if (!appointment) throw notFoundError("Booking not found");

      if (appointment.status === AppointmentStatus.cancelled_by_customer) {
        return appointment;
      }

      if (
        appointment.status !== AppointmentStatus.pending &&
        appointment.status !== AppointmentStatus.confirmed
      ) {
        throw invalidStateError(
          "This appointment can no longer be cancelled by the customer",
          "INVALID_APPOINTMENT_STATE",
          409,
        );
      }

      if (appointment.startsAt.getTime() <= Date.now()) {
        throw invalidStateError(
          "The cancellation window has closed",
          "CANCELLATION_CLOSED",
          410,
        );
      }

      const transitioned = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          status: appointment.status,
        },
        data: { status: AppointmentStatus.cancelled_by_customer },
      });
      if (transitioned.count === 1) {
        return tx.appointment.findUniqueOrThrow({
          where: { id: appointment.id },
        });
      }

      const current = await tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
      });
      if (current.status === AppointmentStatus.cancelled_by_customer) {
        return current;
      }
      throw invalidStateError(
        "This appointment can no longer be cancelled by the customer",
        "INVALID_APPOINTMENT_STATE",
        409,
      );
    });
  }

  async createBooking(payload: CreateBookingBody) {
    const { businessId, services: selections, startsAt } = payload;
    const business = await requireBookableBusiness(businessId);

    return prisma.$transaction((tx) =>
      createAppointmentCore(tx, business, {
        businessId,
        selections,
        startsAt,
        customerName: payload.customerName,
        customerPhone: payload.customerPhone,
        notes: payload.notes,
        bookingChannel: "WEBSITE",
        acquisitionSource: payload.acquisitionSource,
        status: "confirmed",
        generateToken: true,
      }),
    );
  }
}

const bookingsService = new BookingsService();
export default bookingsService;
