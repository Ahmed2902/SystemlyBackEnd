import { Prisma, Roles } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { resolveOperationalBranch } from "../../shared/services/branch-context.service";
import type {
  CreateServiceBody,
  UpdateServiceBody,
} from "./services.schema";

type AuthUser = NonNullable<Express.Request["user"]>;

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const normalizeCategory = (value?: string | null) => {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
};

const canManageMoney = (role?: string) =>
  role === Roles.BusinessAdmin || role === Roles.SuperAdmin;

class ServicesCommandService {
  async createService(user: AuthUser, payload: CreateServiceBody) {
    const scope = await resolveOperationalBranch(user, payload.branchId);
    await this.assertStaffBelongToBranch(
      scope.businessId,
      scope.branchId,
      payload.staffIds,
    );

    return prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          businessId: scope.businessId,
          branchId: scope.branchId,
          name: payload.name,
          description: payload.description || null,
          category: normalizeCategory(payload.category),
          durationMin: payload.durationMin,
          priceEgp: canManageMoney(user.role) ? (payload.priceEgp ?? 0) : 0,
          isActive: payload.isActive,
        },
      });

      if (payload.staffIds.length > 0) {
        await tx.serviceStaff.createMany({
          data: payload.staffIds.map((staffId) => ({
            serviceId: service.id,
            staffId,
          })),
          skipDuplicates: true,
        });
      }

      return service;
    });
  }

  async updateService(id: string, user: AuthUser, payload: UpdateServiceBody) {
    const businessId = user.businessId;
    if (!businessId) {
      throw buildError("Business id missing", 400, "BAD_REQUEST");
    }

    const existing = await prisma.service.findFirst({
      where: { id, businessId },
      select: { id: true, branchId: true },
    });
    if (!existing || !existing.branchId) {
      throw buildError("Service not found", 404, "NOT_FOUND");
    }

    const scope = await resolveOperationalBranch(user, existing.branchId);
    if (payload.staffIds) {
      await this.assertStaffBelongToBranch(
        scope.businessId,
        scope.branchId,
        payload.staffIds,
      );
    }

    const { staffIds, priceEgp, category, ...fields } = payload;
    const data: Prisma.ServiceUpdateInput = {
      ...fields,
      ...(category !== undefined && { category: normalizeCategory(category) }),
      ...(canManageMoney(user.role) && priceEgp !== undefined && { priceEgp }),
    };

    return prisma.$transaction(async (tx) => {
      const service = await tx.service.update({
        where: { id },
        data,
      });

      if (staffIds) {
        await tx.serviceStaff.deleteMany({ where: { serviceId: id } });
        if (staffIds.length > 0) {
          await tx.serviceStaff.createMany({
            data: staffIds.map((staffId) => ({ serviceId: id, staffId })),
            skipDuplicates: true,
          });
        }
      }

      return service;
    });
  }

  async archiveService(id: string, user: AuthUser) {
    const businessId = user.businessId;
    if (!businessId) {
      throw buildError("Business id missing", 400, "BAD_REQUEST");
    }

    const existing = await prisma.service.findFirst({
      where: { id, businessId },
      select: { branchId: true },
    });
    if (!existing?.branchId) {
      throw buildError("Service not found", 404, "NOT_FOUND");
    }
    await resolveOperationalBranch(user, existing.branchId);

    await prisma.service.update({
      where: { id },
      data: { isActive: false },
    });
    return { id, isActive: false };
  }

  private async assertStaffBelongToBranch(
    businessId: string,
    branchId: string,
    staffIds: string[],
  ) {
    if (staffIds.length === 0) return;

    const uniqueIds = [...new Set(staffIds)];
    const count = await prisma.staff.count({
      where: { id: { in: uniqueIds }, businessId, branchId },
    });

    if (count !== uniqueIds.length) {
      throw buildError(
        "One or more selected staff members do not belong to this branch",
        400,
        "INVALID_STAFF_SELECTION",
      );
    }
  }
}

export default new ServicesCommandService();
