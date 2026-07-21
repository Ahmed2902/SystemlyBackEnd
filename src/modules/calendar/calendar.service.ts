import { prisma } from "../../shared/db/prisma";
import { getBusinessDayRange } from "../../shared/utils/timezone";

class CalendarService {
  async getWorkspace(businessId: string, date: string) {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });

    if