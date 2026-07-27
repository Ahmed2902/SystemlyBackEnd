import crypto from "crypto";
import { Roles } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { enqueueEmailJob } from "../../queues/emailQueue";
import type { CreateInviteInput } from "./staff.schema";

const buildError = (message: string, statusCode: number, code: string) => {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

class StaffInviteService {
  async create(
    businessId: string,
    inviterId: string,
    input: CreateInviteInput,
  ) {
    const email = normaliseEmail(input.email);
    const expiresInDays = input.expiresInDays ?? 7;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const [business, inviter, existingUser] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      }),
      prisma.businessUser.findUnique({
        where: { id: inviterId },
        select: { name: true },
      }),
      prisma.businessUser.findUnique({
        where: { email },
        select: { businessId: true },
      }),
    ]);

    if (!business) throw buildError("Business not found", 404, "NOT_FOUND");
    if (existingUser?.businessId === businessId) {
      throw buildError(
        "This account already belongs to the business",
        409,
        "ALREADY_ATTACHED",
      );
    }
    if (existingUser?.businessId && existingUser.businessId !== businessId) {
      throw buildError(
        "This account belongs to another business",
        409,
        "ACCOUNT_IN_OTHER_BUSINESS",
      );
    }

    await prisma.staffInvite.updateMany({
      where: {
        businessId,
        email,
        acceptedAt: null,
      },
      data: { expiresAt: new Date(0) },
    });

    const invite = await prisma.staffInvite.create({
      data: {
        businessId,
        email,
        role: input.role,
        tokenHash,
        expiresAt,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const acceptUrl = `${frontendUrl}/invite?token=${token}`;

    await enqueueEmailJob("staff_invite", {
      to: email,
      businessId,
      inviterName: inviter?.name || null,
      businessName: business.name,
      acceptUrl,
      idempotencyKey: `staff-invite:${invite.id}`,
    });

    return {
      id: invite.id,
      expiresAt: invite.expiresAt,
      acceptUrl,
      delivery: "queued" as const,
    };
  }

  async accept(token: string, userId: string) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invite = await prisma.staffInvite.findUnique({
      where: { tokenHash },
    });

    if (!invite) throw buildError("Invalid invitation", 400, "INVALID_INVITE");
    if (invite.acceptedAt) {
      throw buildError("Invitation already used", 409, "INVITE_ALREADY_USED");
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw buildError("Invitation expired", 410, "INVITE_EXPIRED");
    }
    if (![Roles.Staff, Roles.Receptionist].includes(invite.role)) {
      throw buildError("Invalid invitation role", 400, "INVALID_INVITE_ROLE");
    }

    const user = await prisma.businessUser.findUnique({
      where: { id: userId },
    });
    if (!user) throw buildError("User not found", 404, "NOT_FOUND");
    if (normaliseEmail(user.email) !== normaliseEmail(invite.email)) {
      throw buildError(
        "Sign in with the email address that received the invitation",
        403,
        "INVITE_EMAIL_MISMATCH",
      );
    }
    if (user.businessId && user.businessId !== invite.businessId) {
      throw buildError(
        "Your account already belongs to another business",
        409,
        "ACCOUNT_IN_OTHER_BUSINESS",
      );
    }

    return prisma.$transaction(async (tx) => {
      const staff = await tx.staff.upsert({
        where: {
          businessId_email: {
            businessId: invite.businessId,
            email: normaliseEmail(invite.email),
          },
        },
        create: {
          businessId: invite.businessId,
          name: user.name || user.email,
          email: normaliseEmail(invite.email),
          role: invite.role,
          isActive: true,
        },
        update: {
          role: invite.role,
          isActive: true,
        },
      });

      await tx.businessUser.update({
        where: { id: user.id },
        data: {
          businessId: invite.businessId,
          role: invite.role,
        },
      });

      await tx.staffInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return { staff, userId: user.id };
    });
  }
}

export default new StaffInviteService();
