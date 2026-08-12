import crypto from "node:crypto";
import {
  AppointmentStatus,
  CommissionType,
  Prisma,
  Roles,
} from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { enqueueStaffInviteEmail } from "../../shared/services/email.service";
import {
  lockBranchLifecycle,
  lockBusinessBranches,
} from "../../shared/services/branch-lifecycle-lock.service";
import type {
  CreateBranchInput,
  SetupBranchInput,
  UpdateBranchInput,
} from "./branches.schema";

const branchError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const EPOCH_DATE = "1970-01-01";
const toTimeDate = (hhmm: string) => new Date(`${EPOCH_DATE}T${hhmm}:00.000Z`);

function normalizeNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
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
      return await prisma.$transaction(async (tx) => {
        await lockBusinessBranches(tx, businessId);
        return tx.branch.create({
          data: {
            businessId,
            ...branchData(input),
          } as Prisma.BranchUncheckedCreateInput,
        });
      });
    } catch (error) {
      translateUnique(error);
    }
  }

  async setup(businessId: string, input: SetupBranchInput) {
    const receptionistEmail = input.receptionistEmail
      ? normalizeEmail(input.receptionistEmail)
      : null;
    const inviteToken = receptionistEmail
      ? crypto.randomBytes(32).toString("hex")
      : null;
    const inviteExpiresAt = receptionistEmail
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : null;

    try {
      const configured = await prisma.$transaction(async (tx) => {
        await lockBusinessBranches(tx, businessId);

        const business = await tx.business.findUnique({
          where: { id: businessId },
          select: { id: true, name: true, language: true },
        });
        if (!business) {
          throw branchError("Business not found", 404, "NOT_FOUND");
        }

        if (receptionistEmail) {
          const existingUser = await tx.businessUser.findUnique({
            where: { email: receptionistEmail },
            select: { businessId: true },
          });
          if (existingUser?.businessId === businessId) {
            throw branchError(
              "This account already belongs to the business",
              409,
              "ALREADY_ATTACHED",
            );
          }
          if (existingUser?.businessId) {
            throw branchError(
              "This account belongs to another business",
              409,
              "ACCOUNT_IN_OTHER_BUSINESS",
            );
          }
        }

        const branch = await tx.branch.create({
          data: {
            businessId,
            name: input.name,
            slug: input.slug,
            phone: normalizeNullable(input.phone),
            address: normalizeNullable(input.address),
            city: normalizeNullable(input.city),
            lat: input.lat,
            lng: input.lng,
            timezone: input.timezone,
            isActive: true,
          },
        });

        const serviceIdByClientId = new Map<string, string>();
        for (const service of input.services) {
          const created = await tx.service.create({
            data: {
              businessId,
              branchId: branch.id,
              name: service.name,
              category: service.category,
              description: service.description,
              durationMin: service.durationMin,
              priceEgp: service.priceEgp,
              isActive: true,
            },
          });
          serviceIdByClientId.set(service.clientId, created.id);
        }

        const staffIdByClientId = new Map<string, string>();
        for (const staff of input.staff) {
          const created = await tx.staff.create({
            data: {
              businessId,
              branchId: branch.id,
              name: staff.name,
              role: Roles.Staff,
              jobTitle: staff.jobTitle,
              isActive: true,
            },
          });
          staffIdByClientId.set(staff.clientId, created.id);
        }

        const serviceStaff = input.staff.flatMap((staff) => {
          const staffId = staffIdByClientId.get(staff.clientId)!;
          return staff.serviceClientIds.map((serviceClientId) => ({
            staffId,
            serviceId: serviceIdByClientId.get(serviceClientId)!,
            commissionType: CommissionType.NONE,
            commissionAmount: 0,
          }));
        });
        await tx.serviceStaff.createMany({ data: serviceStaff });

        const availability = input.staff.flatMap((staff) => {
          const staffId = staffIdByClientId.get(staff.clientId)!;
          return staff.availability.map((entry) => ({
            staffId,
            dayOfWeek: entry.dayOfWeek,
            startTime: toTimeDate(entry.startTime),
            endTime: toTimeDate(entry.endTime),
          }));
        });
        await tx.availability.createMany({ data: availability });

        let invite: { id: string; expiresAt: Date } | null = null;
        if (receptionistEmail && inviteToken && inviteExpiresAt) {
          await tx.staffInvite.updateMany({
            where: { businessId, email: receptionistEmail, acceptedAt: null },
            data: { expiresAt: new Date(0) },
          });
          invite = await tx.staffInvite.create({
            data: {
              businessId,
              branchId: branch.id,
              email: receptionistEmail,
              role: Roles.Receptionist,
              tokenHash: hashToken(inviteToken),
              expiresAt: inviteExpiresAt,
            },
            select: { id: true, expiresAt: true },
          });
        }

        return { branch, business, invite };
      });

      let invitation:
        | {
            id: string;
            expiresAt: Date;
            acceptUrl: string;
            delivery: "queued" | "not_queued";
          }
        | null = null;

      if (
        configured.invite &&
        receptionistEmail &&
        inviteToken
      ) {
        const frontendUrl = (
          process.env.FRONTEND_URL || "http://localhost:3000"
        ).replace(/\/$/, "");
        const acceptUrl = `${frontendUrl}/invite?token=${encodeURIComponent(inviteToken)}`;
        let delivery: "queued" | "not_queued" = "queued";
        try {
          await enqueueStaffInviteEmail(
            receptionistEmail,
            {
              businessName: configured.business.name,
              acceptUrl,
              locale: configured.business.language,
              idempotencyKey: `receptionist-invite:${configured.invite.id}`,
            },
            { idempotencyKey: `receptionist-invite:${configured.invite.id}` },
          );
        } catch {
          delivery = "not_queued";
        }
        invitation = {
          id: configured.invite.id,
          expiresAt: configured.invite.expiresAt,
          acceptUrl,
          delivery,
        };
      }

      return { branch: configured.branch, invitation };
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
      await lockBusinessBranches(tx, businessId);
      await lockBranchLifecycle(tx, businessId, branchId);

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
    return prisma.$transaction(async (tx) => {
      await lockBusinessBranches(tx, businessId);
      await lockBranchLifecycle(tx, businessId, branchId);
      const branch = await tx.branch.findFirst({
        where: { id: branchId, businessId },
      });
      if (!branch) throw branchError("Branch not found", 404, "BRANCH_NOT_FOUND");
      if (branch.isActive) return branch;
      return tx.branch.update({
        where: { id: branchId },
        data: { isActive: true },
      });
    });
  }
}

export default new BranchesService();
