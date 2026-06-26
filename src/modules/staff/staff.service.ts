import { prisma } from "../../shared/db/prisma";
import crypto from "crypto";
import { enqueueEmailJob } from "../../queues/emailQueue";
import { Prisma, Roles, CommissionType } from "@prisma/client";
import type {
  StaffCreateInput,
  StaffUpdateInput,
  AssignServiceInput,
  UpdateServiceStaffInput,
  AvailabilityEntry,
  AvailabilityOverrideInput,
  StaffListResult,
} from "./staff.schema";

const buildErr = (message: string, statusCode: number, code: string) => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

class StaffService {
  async listByBusiness(
    businessId: string,
    page = 1,
    perPage = 20,
  ): Promise<StaffListResult> {
    const where = { businessId } as any;
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

  async createStaff(businessId: string, payload: StaffCreateInput) {
    return prisma.staff.create({
      data: { businessId, ...payload },
    });
  }

  async updateStaff(id: string, payload: StaffUpdateInput) {
    return prisma.staff.update({ where: { id }, data: payload });
  }

  async deleteStaff(id: string) {
    await prisma.staff.delete({ where: { id } });
    return { success: true };
  }

  async assignService(staffId: string, payload: AssignServiceInput) {
    return prisma.serviceStaff.create({
      data: {
        staffId,
        serviceId: payload.serviceId,
        commissionType: payload.commissionType,
        commissionAmount: payload.commissionAmount,
      },
      include: {
        service: {
          select: { id: true, name: true, priceEgp: true },
        },
        staff: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updateServiceStaff(
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
        service: {
          select: { id: true, name: true, priceEgp: true },
        },
        staff: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async unassignService(staffId: string, serviceId: string) {
    return prisma.serviceStaff.delete({
      where: { serviceId_staffId: { serviceId, staffId } },
    });
  }

  async getServiceStaff(staffId: string, serviceId: string) {
    return prisma.serviceStaff.findUnique({
      where: { serviceId_staffId: { serviceId, staffId } },
      include: {
        service: {
          select: { id: true, name: true, priceEgp: true },
        },
        staff: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async getAvailability(staffId: string) {
    return prisma.availability.findMany({
      where: { staffId },
      orderBy: { dayOfWeek: "asc" },
    });
  }

  async replaceAvailability(staffId: string, entries: AvailabilityEntry[]) {
    await prisma.availability.deleteMany({ where: { staffId } });
    const data = entries.map((e) => ({
      staffId,
      dayOfWeek: e.dayOfWeek,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
      breakAfterMin: e.breakAfterMin ?? null,
    }));
    await prisma.availability.createMany({ data });
    return { success: true };
  }

  async addOverride(staffId: string, payload: AvailabilityOverrideInput) {
    return prisma.availabilityOverride.create({
      data: {
        staffId,
        overrideDate: new Date(payload.overrideDate),
        isDayOff: payload.isDayOff ?? false,
        startTime: payload.startTime ? new Date(payload.startTime) : null,
        endTime: payload.endTime ? new Date(payload.endTime) : null,
      },
    });
  }

  async deleteOverride(id: string) {
    await prisma.availabilityOverride.delete({ where: { id } });
    return { success: true };
  }

  async createInvite(
    businessId: string,
    email: string,
    role: Roles | string,
    inviterId?: string,
    expiresInDays = 7,
  ) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const invite = await prisma.staffInvite.create({
      data: {
        businessId,
        email,
        role: role as any,
        tokenHash,
        expiresAt,
      },
    });

    const [inviter, business] = await Promise.all([
      inviterId
        ? prisma.businessUser.findUnique({ where: { id: inviterId } })
        : null,
      prisma.business.findUnique({ where: { id: businessId } }),
    ]);

    const acceptUrl = `${process.env.FRONTEND_URL}/invite?token=${token}`;

    await enqueueEmailJob("staff_invite", {
      to: email,
      inviterName: inviter?.name || null,
      businessName: business?.name || null,
      acceptUrl,
    });

    return { id: invite.id, expiresAt };
  }

  async acceptInvite(token: string, userId: string) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invite = await prisma.staffInvite.findUnique({
      where: { tokenHash },
    });
    if (!invite) throw buildErr("Invalid invite token", 400, "INVALID_INVITE");
    if (invite.expiresAt.getTime() < Date.now())
      throw buildErr("Invite expired", 400, "INVITE_EXPIRED");
    if (invite.acceptedAt)
      throw buildErr("Invite already used", 400, "INVITE_ALREADY_USED");

    const user = await prisma.businessUser.findUnique({
      where: { id: userId },
    });
    if (!user) throw buildErr("User not found", 404, "NOT_FOUND");
    if (!user.email || user.email !== invite.email)
      throw buildErr(
        "Logged-in user email does not match invite email",
        403,
        "INVITE_EMAIL_MISMATCH",
      );
    if (user.businessId && user.businessId !== invite.businessId)
      throw buildErr(
        "User already belongs to another business",
        403,
        "USER_BUSINESS_MISMATCH",
      );

    await prisma.businessUser.update({
      where: { id: user.id },
      data: { businessId: invite.businessId, role: invite.role as any },
    });

    const staff = await prisma.staff.create({
      data: {
        businessId: invite.businessId,
        name: user.name || user.email || "",
        role: invite.role as any,
        isActive: true,
      },
    });

    await prisma.staffInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return { staff, userId: user.id };
  }

  async getCommission(
    staffId: string,
    businessId: string,
    from?: string,
    to?: string,
  ) {
    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff) throw buildErr("Staff not found", 404, "NOT_FOUND");

    if (staff.businessId !== businessId)
      throw buildErr(
        "Staff does not belong to this business",
        403,
        "FORBIDDEN",
      );

    const where: Prisma.InvoiceLineItemWhereInput = {
      staffId,
      invoice: {
        is: {
          businessId,
          status: "paid",
          appointment: {
            is: {
              status: "completed",
            },
          },
        },
      } as any,
    };

    if (from || to) {
      (where.invoice as any) = {
        ...(where.invoice as any),
        is: {
          ...((where.invoice as any)?.is ?? {}),
          paidAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        },
      };
    }

    const lineItems = await prisma.invoiceLineItem.findMany({
      where,
      orderBy: {
        invoice: {
          paidAt: "desc",
        },
      },
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
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const totalSalesCents = lineItems.reduce(
      (sum, item) => sum + item.totalCents,
      0,
    );

    const totalCommissionCents = lineItems.reduce(
      (sum, item) => sum + (item.commissionEarnedCents ?? 0),
      0,
    );

    return {
      staffId,

      totalSalesCents,

      totalCommissionCents,

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
}

const staffService = new StaffService();
export default staffService;
