import { prisma } from "../../shared/db/prisma";
import { getBusinessDayRange } from "../../shared/utils/timezone";

class CalendarService {
  async getWorkspace(businessId: string, date: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });

    if (!business) {
      const err: any = new Error("Business not found");
      err.statusCode = 404;
      err.code = "NOT_FOUND";
      throw err;
    }

    const timezone = business.timezone || "UTC";
    const { start, end } = getBusinessDayRange(timezone, date);
    const overrideDate = new Date(date);

    const [appointments, staff, breaks, services] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          businessId,
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        orderBy: { startsAt: "asc" },
        include: {
          customer: true,
          appointmentServices: {
            orderBy: { order: "asc" },
            include: {
              service: true,
              staff: true,
            },
          },
          customItems: true,
          invoice: true,
          clinicVisitRecord: true,
        },
      }),
      prisma.staff.findMany({
        where: { businessId, isActive: true },
        orderBy: { name: "asc" },
        include: {
          serviceStaff: {
            select: { serviceId: true },
          },
          availability: {
            orderBy: { dayOfWeek: "asc" },
          },
          availabilityOverrides: {
            where: { overrideDate },
          },
        },
      }),
      prisma.staffBreak.findMany({
        where: { businessId, breakDate: overrideDate },
        orderBy: { startTime: "asc" },
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

    return {
      date,
      timezone,
      appointments,
      staff,
      breaks,
      services,
    };
  }
}

export default new CalendarService();
