import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { timeOfDayToDate } from "../../shared/utils/timezone";
import type {
  AssignServiceInput,
  AvailabilityOverrideInput,
  StaffListResult,
  UpdateServiceStaffInput,
} from "./staff.schema";

class StaffService {
  async listByBusiness(
    businessId: string,
    page = 1,
    perPage = 20,
  ): Promise<StaffListResult> {
    const where: Prisma.StaffWhereInput = { businessId };
    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { updatedAt: "desc" },
        include: {
          serviceStaff: {
            include: {
              service: {
                select: { id: true, name: true, priceEgp: true },
              },
            },
          },
        },
      }),
      prisma.staff.count({ where }),
    ]);
    return { items, total, page, perPage };
  }

  assignService(staffId: string, payload: AssignServiceInput) {
    return prisma.serviceStaff.create({
      data: {
        staffId,
        serviceId: payload.serviceId,
        commissionType: payload.commissionType,
        commissionAmount: payload.commissionAmount,
      },
      include: {
        service: { select: { id: true, name: true, priceEgp: true } },
        staff: { select: { id: true, name: true } },
      },
    });
  }

  updateServiceStaff(
    staffId: string,
    serviceId: string,
    payload: UpdateServiceStaffInput,
  ) {
    return prisma.serviceStaff.update({
      where: { serviceId_staffId: { serviceId, staffId } },
      data: {
        commissionType: payload.commissionType,
        commissionAmount: payload.commissionAmount,
      },
      include: {
        service: { select: { id: true, name: true, priceEgp: true } },
        staff: { select: { id: true, name: true } },
      },
    });
  }

  unassignService(staffId: string, serviceId: string) {
    return prisma.serviceStaff.delete({
      where: { serviceId_staffId: { serviceId, staffId } },
    });
  }

  getServiceStaff(staffId: string, serviceId: string) {
    return prisma.serviceStaff.findUnique({
      where: { serviceId_staffId: { serviceId, staffId } },
      include: {
        service: { select: { id: true, name: true, priceEgp: true } },
        staff: { select: { id: true, name: true } },
      },
    });
  }

  getAvailability(staffId: string) {
    return prisma.availability.findMany({
      where: { staffId },
      orderBy: { dayOfWeek: "asc" },
    });
  }

  listAvailabilityOverridesForDate(staffId: string, date: string) {
    return prisma.availabilityOverride.findMany({
      where: { staffId, overrideDate: new Date(date) },
      orderBy: { updatedAt: "desc" },
    });
  }

  addOverride(staffId: string, payload: AvailabilityOverrideInput) {
    return prisma.availabilityOverride.create({
      data: {
        staffId,
        overrideDate: new Date(payload.overrideDate),
        isDayOff: payload.isDayOff ?? false,
        startTime: payload.startTime
          ? timeOfDayToDate(payload.startTime)
          : null,
        endTime: payload.endTime ? timeOfDayToDate(payload.endTime) : null,
      },
    });
  }

  async deleteOverride(id: string) {
    await prisma.availabilityOverride.delete({ where: { id } });
    return { success: true };
  }

  async getCommission(
    staffId: string,
    businessId: string,
    from?: string,
    to?: string,
  ) {
    const where: Prisma.InvoiceLineItemWhereInput = {
      staffId,
      invoice: {
        is: {
          businessId,
          status: "paid",
          appointment: {
            is: { status: "completed" },
          },
        },
      },
    };

    if (from || to) {
      const invoice = where.invoice as Prisma.InvoiceScalarRelationFilter;
      where.invoice = {
        ...invoice,
        is: {
          ...(invoice.is ?? {}),
          paidAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        },
      };
    }

    const lineItems = await prisma.invoiceLineItem.findMany({
      where,
      orderBy: { invoice: { paidAt: "desc" } },
      select: {
        id: true,
        description: true,
        totalCents: true,
        commissionType: true,
        commissionAmount: true,
        commissionEarnedCents: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            paidAt: true,
          },
        },
        service: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      staffId,
      totalSalesCents: lineItems.reduce((sum, item) => sum + item.totalCents, 0),
      totalCommissionCents: lineItems.reduce(
        (sum, item) => sum + (item.commissionEarnedCents ?? 0),
        0,
      ),
      lineItems: lineItems.map((item) => ({
        invoiceId: item.invoice.id,
        invoiceNumber: item.invoice.invoiceNumber,
        paidAt: item.invoice.paidAt,
        serviceId: item.service?.id,
        serviceName: item.service?.name,
        description: item.description,
        totalCents: item.totalCents,
        commissionType: item.commissionType,
        commissionAmount: item.commissionAmount,
        commissionEarnedCents: item.commissionEarnedCents,
      })),
    };
  }

  listStaffBreaksForDate(businessId: string, date: string) {
    return prisma.staffBreak.findMany({
      where: { businessId, breakDate: new Date(date) },
      orderBy: { startTime: "asc" },
    });
  }

  createStaffBreak(
    businessId: string,
    payload: {
      staffId: string;
      breakDate: string;
      startTime: string;
      endTime: string;
      label?: string;
    },
  ) {
    return prisma.staffBreak.create({
      data: {
        businessId,
        staffId: payload.staffId,
        breakDate: new Date(`${payload.breakDate}T00:00:00.000Z`),
        startTime: timeOfDayToDate(payload.startTime),
        endTime: timeOfDayToDate(payload.endTime),
        label: payload.label,
      },
    });
  }

  removeStaffBreak(_businessId: string, id: string) {
    return prisma.staffBreak.delete({ where: { id } });
  }
}

const staffService = new StaffService();
export default staffService;
