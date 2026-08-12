import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import type { CreateBranchInput, UpdateBranchInput } from "./branches.schema";

const branchError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

function normalizeNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function branchData(input: CreateBranchInput | UpdateBranchInput) {
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.slug !== undefined ? { slug: input.slug.trim() } : {}),
    ...(input.phone !== undefined ? { phone: normalizeNullable(input.phone) } : {}),
    ...(input.address !== undefined
      ? { address: normalizeNullable(input.address) }
      : {}),
    ...(input.city !== undefined ? { city: normalizeNullable(input.city) } : {}),
    ...(input.lat !== undefined ? { lat: input.lat } : {}),
    ...(input.lng !== undefined ? { lng: input.lng } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone.trim() } : {}),
  };
}

function translateUnique(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw branchError(
      "A branch with this slug already exists",
      409,
      "BRANCH_SLUG_TAKEN",
    );
  }
  throw error;
}

class BranchesService {
  list(businessId: string, includeInactive = false) {
    return prisma.branch.findMany({
      where: {
        businessId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });
  }

  async get(businessId: string, branchId: string) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, businessId },
    });
    if (!branch) throw branchError("Branch not found", 404, "BRANCH_NOT_FOUND");
    return branch;
  }

  async create(businessId: string, input: CreateBranchInput) {
    try {
      return await prisma.branch.create({
        data: {
          businessId,
          ...branchData(input),
        } as Prisma.BranchUncheckedCreateInput,
      });
    } catch (error) {
      translateUnique(error);
    }
  }

  async update(businessId: string, branchId: string, input: UpdateBranchInput) {
    await this.get(businessId, branchId);
    try {
      return await prisma.branch.update({
        where: { id: branchId },
        data: branchData(input),
      });
    } catch (error) {
      translateUnique(error);
    }
  }

  async deactivate(businessId: string, branchId: string) {
    return prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { id: branchId, businessId },
      });
      if (!branch) throw branchError("Branch not found", 404, "BRANCH_NOT_FOUND");
      if (!branch.isActive) return branch;

      const activeCount = await tx.branch.count({
        where: { businessId, isActive: true },
      });
      if (activeCount <= 1) {
        throw branchError(
          "A business must keep at least one active branch",
          409,
          "LAST_ACTIVE_BRANCH",
        );
      }

      const blockingAppointment = await tx.appointment.findFirst({
        where: {
          businessId,
          branchId,
          status: {
            in: [
              AppointmentStatus.pending,
              AppointmentStatus.confirmed,
              AppointmentStatus.in_progress,
            ],
          },
          endsAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (blockingAppointment) {
        throw branchError(
          "Move or cancel active and upcoming appointments before deactivating this branch",
          409,
          "BRANCH_HAS_ACTIVE_APPOINTMENTS",
        );
      }

      return tx.branch.update({
        where: { id: branchId },
        data: { isActive: false },
      });
    });
  }

  async reactivate(businessId: string, branchId: string) {
    await this.get(businessId, branchId);
    return prisma.branch.update({
      where: { id: branchId },
      data: { isActive: true },
    });
  }
}

export default new BranchesService();
