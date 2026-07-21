import { prisma } from "../../shared/db/prisma";
import { getBusinessDayRange } from "../../shared/utils/timezone";

class CalendarService {
  async getWorkspace(businessId: string, date: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });

    if (!business) {
      throw Object.assign(new Error("Business not found"), {
        statusCode: 404,
        code: "NOT_FOUND",
      });
    }

    const timezone = business.timezone || "UTC";
    const { start, end } = getBusinessDayRange(timezone, date);
    const requestedDate = new Date(`${date}T00:00:00.000Z`);
    const weekday = requestedDate.getUTCDay();

    const [appointments, staff, breaks, services] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          businessId,
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          notes: true,
          discountCents: true,
          customerId: true,
          staffId: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              visitCount: true,
              noShowCount: true,
            },
          },
          appointmentServices: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              serviceId: true,
              staffId: true,
              startsAt: true,
              endsAt: true,
              priceEgpSnapshot: true,
              service: { select: { name: true } },
              staff: { select: { id: true, name: true } },
            },
          },
          customItems: {
            select: { id: true, description: true, priceCents: true },
          },
          invoice: { select: { status: true } },
          clinicVisitRecord: {
            select: {
              notes: true,
              diagnosis: true,
              prescriptionJson: true,
            },
          },
        },
      }),
      prisma.staff.findMany({
        where: { businessId, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          photoUrl: true,
          serviceStaff: { select: { serviceId: true } },
          availability: {
            where: { dayOfWeek: weekday },
            orderBy: { startTime: "asc" },
            select: {
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              breakAfterMin: true,
            },
          },
          availabilityOverrides: {
            where: { overrideDate: requestedDate },
            select: {
              id: true,
              overrideDate: true,
              isDayOff: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      }),
      prisma.staffBreak.findMany({
        where: { businessId, breakDate: requestedDate },
        orderBy: { startTime: "asc" },
        select: {
          id: true,
          staffId: true,
          startTime: true,
          endTime: true,
          label: true,
        },
      }),
      prisma.service.findMany({
        where: { businessId, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          durationMin: true,
          priceEgp: true,
        },
      }),
    ]);

    return { date, timezone, appointments, staff, breaks, services };
  }
}

export default new CalendarService();
