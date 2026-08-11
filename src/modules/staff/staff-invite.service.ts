import crypto from "node:crypto";
import { Roles } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { enqueueStaffInviteEmail } from "../../shared/services/email.service";
import { signAccessToken } from "../../shared/utils/token.util";
import type { CreateInviteInput } from "./staff.schema";

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

class StaffInviteService {
  private async getAvailableInvite(token: string) {
    const invite = await prisma.staffInvite.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    if (!invite) throw buildError("Invalid invitation", 400, "INVALID_INVITE");
    if (invite.acceptedAt) {
      throw buildError("Invitation already used", 409, "INVITE_ALREADY_USED");
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      throw buildError("Invitation expired", 410, "INVITE_EXPIRED");
    }
    if (invite.role !== Roles.Receptionist) {
      throw buildError("Invalid invitation role", 400, "INVALID_INVITE_ROLE");
    }

    return invite;
  }

  async create(businessId: string, input: CreateInviteInput) {
    const email = normaliseEmail(input.email);
    const expiresInDays = input.expiresInDays ?? 7;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const [business, existingUser] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, language: true },
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

    const invite = await prisma.$transaction(async (tx) => {
      await tx.staffInvite.updateMany({
        where: { businessId, email, acceptedAt: null },
        data: { expiresAt: new Date(0) },
      });

      return tx.staffInvite.create({
        data: {
          businessId,
          email,
          role: Roles.Receptionist,
          tokenHash,
          expiresAt,
        },
      });
    });

    const frontendUrl = (
      process.env.FRONTEND_URL || "http://localhost:3000"
    ).replace(/\/$/, "");
    const acceptUrl = `${frontendUrl}/invite?token=${encodeURIComponent(token)}`;

    await enqueueStaffInviteEmail(
      email,
      {
        businessName: business.name,
        acceptUrl,
        locale: business.language,
        idempotencyKey: `receptionist-invite:${invite.id}`,
      },
      { idempotencyKey: `receptionist-invite:${invite.id}` },
    );

    return {
      id: invite.id,
      expiresAt: invite.expiresAt,
      acceptUrl,
      delivery: "queued" as const,
    };
  }

  async resolve(token: string) {
    const invite = await this.getAvailableInvite(token);
    const [account, business] = await Promise.all([
      prisma.businessUser.findUnique({
        where: { email: normaliseEmail(invite.email) },
        select: { id: true },
      }),
      prisma.business.findUnique({
        where: { id: invite.businessId },
        select: { name: true },
      }),
    ]);

    return {
      email: normaliseEmail(invite.email),
      accountExists: Boolean(account),
      businessName: business?.name ?? "Systemly business",
      expiresAt: invite.expiresAt,
    };
  }

  async validateForEmail(token: string, email: string) {
    const invite = await this.getAvailableInvite(token);
    if (normaliseEmail(invite.email) !== normaliseEmail(email)) {
      throw buildError(
        "Use the email address that received the invitation",
        403,
        "INVITE_EMAIL_MISMATCH",
      );
    }
    return invite;
  }

  async accept(token: string, userId: string) {
    const invite = await this.getAvailableInvite(token);

    const user = await prisma.businessUser.findUnique({
      where: { id: userId },
      select: { id: true, email: true, businessId: true },
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
      const claimed = await tx.staffInvite.updateMany({
        where: {
          id: invite.id,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
          role: Roles.Receptionist,
        },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw buildError(
          "Invitation is expired or already used",
          409,
          "INVITE_NOT_AVAILABLE",
        );
      }

      const updatedUser = await tx.businessUser.update({
        where: { id: user.id },
        data: {
          businessId: invite.businessId,
          role: Roles.Receptionist,
        },
        select: {
          id: true,
          businessId: true,
          role: true,
        },
      });

      return {
        user: updatedUser,
        accessToken: signAccessToken({
          userId: updatedUser.id,
          businessId: updatedUser.businessId,
          role: updatedUser.role,
        }),
      };
    });
  }
}

export default new StaffInviteService();
