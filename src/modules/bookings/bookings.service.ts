import { prisma } from "../../shared/db/prisma";
import { DateTime } from "luxon";
import type { AvailabilityQuery, CreateBookingBody } from "./bookings.schema";
import { getBusinessDayRange } from "../../shared/utils/timezone";
import {
  computeStaffFreeIntervals,
  isStaffFreeFor,
} from "./bookings.availabilty.utils";

import { createAppointmentCore } from "../Scheduling/Scheduling.service";
import { notFoundError } from "../appointments/appointments.helper";

const CANCEL_TTL_DAYS = parseInt(
  process.env.BOOKING_CANCEL_TTL_DAYS || "30",
  10,
);
const SLOT_INTERVAL_MIN = 15;

class BookingsService {
  async getAvailability(opts: AvailabilityQuery) {
    const { businessId, services: selections, date, timezone } = opts;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    const tz = timezone || (business?.timezone as string) || "UTC";

    const serviceIds = selections.map((s) => s.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
    });
    if (services.length !== serviceIds.length)
      throw new Error("One or more services not found");
    const serviceById = new Map(services.map((s) => [s.id, s]));

    const eligibleByService: string[][] = [];
    for (const sel of selections) {
      if (sel.staffId) {
        const row = await prisma.serviceStaff.findUnique({
          where: {
            serviceId_staffId: {
              serviceId: sel.serviceId,
              staffId: sel.staffId,
            },
          },
        });
        eligibleByService.push(row ? [sel.staffId] : []);
      } else {
        const rows = await prisma.serviceStaff.findMany({
          where: { serviceId: sel.serviceId },
          include: { staff: true },
        });
        eligibleByService.push(
          rows.filter((r) => r.staff?.isActive).map((r) => r.staffId),
        );
      }
    }

    if (eligibleByService.some((list) => list.length === 0)) return [];

    const allStaffIds = [...new Set(eligibleByService.flat())];
    const freeByStaff = await computeStaffFreeIntervals(
      allStaffIds,
      businessId,
      date,
      tz,
    );

    const { start: dayStartRaw, end: dayEndRaw } = getBusinessDayRange(
      tz,
      date,
    );
    const dayStart = DateTime.fromJSDate(dayStartRaw).setZone(tz);
    const dayEnd = DateTime.fromJSDate(dayEndRaw).setZone(tz);

    const totalDuration = selections.reduce(
      (sum, s) => sum + serviceById.get(s.serviceId)!.durationMin,
      0,
    );

    const results: {
      time: string;
      display: string;
      assignments: { serviceId: string; staffId: string }[];
    }[] = [];

    let candidate = dayStart;
    const now = DateTime.now().setZone(tz);
    if (candidate < now) {
      const remainder = now.minute % SLOT_INTERVAL_MIN;
      candidate =
        remainder === 0
          ? now.set({ second: 0, millisecond: 0 })
          : now
              .plus({ minutes: SLOT_INTERVAL_MIN - remainder })
              .set({ second: 0, millisecond: 0 });
    }

    while (candidate.plus({ minutes: totalDuration }) <= dayEnd) {
      let segmentStart = candidate;
      const assignments: { serviceId: string; staffId: string }[] = [];
      let valid = true;

      for (let i = 0; i < selections.length; i++) {
        const dur = serviceById.get(selections[i].serviceId)!.durationMin;
        const segmentEnd = segmentStart.plus({ minutes: dur });
        const candidates = eligibleByService[i];
        const chosenStaff = candidates.find((sId) =>
          isStaffFreeFor(freeByStaff.get(sId) ?? [], segmentStart, segmentEnd),
        );
        if (!chosenStaff) {
          valid = false;
          break;
        }
        assignments.push({
          serviceId: selections[i].serviceId,
          staffId: chosenStaff,
        });
        segmentStart = segmentEnd;
      }

      if (valid) {
        results.push({
          time: candidate.toUTC().toISO()!,
          display: candidate.toFormat("HH:mm"),
          assignments,
        });
      }

      candidate = candidate.plus({ minutes: SLOT_INTERVAL_MIN });
    }

    return results;
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
        acquisitionSource: payload.acquisitionSource,
        status: "pending",
        generateToken: true,
      }),
    );
  }
}

const bookingsService = new BookingsService();
export default bookingsService;
