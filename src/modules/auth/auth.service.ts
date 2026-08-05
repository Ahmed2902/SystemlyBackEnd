import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  generateEmailToken,
  verifyRefreshToken,
  signAccessToken,
} from "../../shared/utils/token.util";
import { prisma } from "../../shared/db/prisma";
import * as redis from "../../shared/config/redis";
import { AUTH_CONSTANTS } from "../../shared/config/config";
import * as emailService from "../../shared/services/email.service";
import type {
  EmailBody,
  GetMeInput,
  LoginBody,
  OauthSignInInput,
  RefreshTokenInput,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailQuery,
} from "./auth.schema";
import { Roles } from "@prisma/client";

const buildErr = (message: string, statusCode: number, code: string) => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

class AuthService {
  async register(payload: RegisterBody) {
    const { name, email, password, phone, preferredLanguage } = payload;
    const existing = await prisma.businessUser.findUnique({ where: { email } });
    if (existing) {
      throw buildErr(
        "An account with this email already exists",
        409,
        "EMAIL_TAKEN",
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.businessUser.create({
      data: {
        name,
        email,
        passwordHash,
        phone,
        preferredLanguage: preferredLanguage ?? "en",
        role: Roles.User,
      },
    });

    const token = generateEmailToken();
    await redis.set(
      `email_verify:${token}`,
      user.email,
      AUTH_CONSTANTS.EMAIL_TOKEN_TTL_SECONDS,
    );

    await emailService.enqueueVerificationEmail(
      {
        name: user.name,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
      },
      token,
      { idempotencyKey: `verification:${user.id}:${token}` },
    );

    return { userId: user.id };
  }

  async verifyEmail({ token }: VerifyEmailQuery) {
    const key = `email_verify:${token}`;
    const email = await redis.get(key);
    if (!email) {
      throw buildErr(
        "This verification link is invalid or has expired. Please request a new one.",
        400,
        "INVALID_TOKEN",
      );
    }

    const user = await prisma.businessUser.findUnique({
      where: { email },
      include: { business: { select: { vertical: true, timezone: true } } },
    });
    if (!user) throw buildErr("User not found", 404, "NOT_FOUND");

    await prisma.businessUser.update({
      where: { email: user.email },
      data: { emailVerified: true },
    });
    await redis.del(key);

    await emailService.enqueueWelcomeEmail(
      {
        name: user.name,
        email: user.email,
        preferredLanguage: user.preferredLanguage,
      },
      { idempotencyKey: `welcome:${user.id}` },
    );

    const accessToken = signAccessToken({
      userId: user.id,
      businessId: user.businessId,
      role: user.role,
    });
    const refreshTokenStr = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: refreshTokenStr,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessId: user.businessId,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
        vertical: user.business?.vertical ?? null,
        timezone: user.business?.timezone ?? null,
      },
    };
  }

  async login(payload: LoginBody) {
    const { email, password } = payload;
    const user = await prisma.businessUser.findUnique({
      where: { email },
      include: { business: { select: { vertical: true, timezone: true } } },
    });
    if (!user) {
      throw buildErr("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw buildErr("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    if (!user.emailVerified) {
      const error = buildErr(
        "Please verify your email before logging in. Check your inbox for the verification link.",
        403,
        "EMAIL_NOT_VERIFIED",
      ) as Error & { details?: { email: string } };
      error.details = { email: user.email };
      throw error;
    }

    const now = new Date();
    setImmediate(() => {
      void prisma.businessUser.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });
    });

    const accessToken = signAccessToken({
      userId: user.id,
      businessId: user.businessId,
      role: user.role,
    });
    const refreshTokenStr = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: refreshTokenStr,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessId: user.businessId,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
        vertical: user.business?.vertical ?? null,
        timezone: user.business?.timezone ?? null,
      },
    };
  }

  async createRefreshToken(userId: string) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    const row = await prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
    await prisma.businessUser.update({
      where: { id: userId },
      data: { currentRefreshTokenId: row.id },
    });
    return token;
  }

  async revokeRefreshToken(token: string) {
    const row = await prisma.refreshToken.findUnique({ where: { token } });
    if (!row) return false;
    await prisma.refreshToken.update({
      where: { id: row.id },
      data: { revoked: true },
    });
    const user = await prisma.businessUser.findUnique({
      where: { id: row.userId },
    });
    if (user && user.currentRefreshTokenId === row.id) {
      await prisma.businessUser.update({
        where: { id: user.id },
        data: { currentRefreshTokenId: null },
      });
    }
    return true;
  }

  async rotateRefreshToken(oldToken: string) {
    const row = await prisma.refreshToken.findUnique({
      where: { token: oldToken },
    });
    if (
      !row ||
      row.revoked ||
      (row.expiresAt && row.expiresAt.getTime() < Date.now())
    ) {
      throw buildErr(
        "Invalid or expired refresh token",
        401,
        "INVALID_REFRESH_TOKEN",
      );
    }

    const newToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    const newRow = await prisma.refreshToken.create({
      data: { userId: row.userId, token: newToken, expiresAt },
    });
    await prisma.refreshToken.update({
      where: { id: row.id },
      data: { revoked: true },
    });
    await prisma.businessUser.update({
      where: { id: row.userId },
      data: { currentRefreshTokenId: newRow.id },
    });
    return newToken;
  }

  async refreshToken({ refreshToken }: RefreshTokenInput): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    verifyRefreshToken(refreshToken);
    const row = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    if (
      !row ||
      row.revoked ||
      (row.expiresAt && row.expiresAt.getTime() < Date.now())
    ) {
      throw buildErr(
        "Invalid or expired refresh token",
        401,
        "INVALID_REFRESH_TOKEN",
      );
    }

    const user = await prisma.businessUser.findUnique({
      where: { id: row.userId },
    });
    if (!user) {
      throw buildErr("Invalid token user", 401, "INVALID_REFRESH_TOKEN");
    }

    const newRefresh = await this.rotateRefreshToken(refreshToken);
    const accessToken = signAccessToken({
      userId: user.id,
      businessId: user.businessId,
      role: user.role,
    });
    return { accessToken, refreshToken: newRefresh };
  }

  async resendVerificationEmail({ email }: EmailBody) {
    const user = await prisma.businessUser.findUnique({ where: { email } });
    if (user && user.emailVerified) {
      throw buildErr(
        "This email is already verified.",
        400,
        "ALREADY_VERIFIED",
      );
    }

    if (user) {
      const token = generateEmailToken();
      await redis.set(
        `email_verify:${token}`,
        user.email,
        AUTH_CONSTANTS.EMAIL_TOKEN_TTL_SECONDS,
      );
      await emailService.enqueueVerificationEmail(
        {
          name: user.name,
          email: user.email,
          preferredLanguage: user.preferredLanguage,
        },
        token,
        { idempotencyKey: `verification:${user.id}:${token}` },
      );
    }

    return { sent: true };
  }

  async forgotPassword({ email }: EmailBody) {
    const user = await prisma.businessUser.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      await redis.set(
        `pwd_reset:${token}`,
        user.id,
        AUTH_CONSTANTS.PWD_RESET_TTL_SECONDS,
      );
      await emailService.enqueuePasswordResetEmail(
        {
          name: user.name,
          email: user.email,
          preferredLanguage: user.preferredLanguage,
        },
        token,
        { idempotencyKey: `password-reset:${user.id}:${token}` },
      );
    }
    return { sent: true };
  }

  async resetPassword({ token, password: newPassword }: ResetPasswordBody) {
    const key = `pwd_reset:${token}`;
    const userId = await redis.get(key);
    if (!userId) {
      throw buildErr(
        "This password reset link is invalid or has expired.",
        400,
        "INVALID_TOKEN",
      );
    }
    const user = await prisma.businessUser.findUnique({
      where: { id: userId },
    });
    if (!user) throw buildErr("Invalid token user", 400, "INVALID_TOKEN");

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.businessUser.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await redis.del(key);

    return { success: true };
  }

  async getMe({ userId }: GetMeInput) {
    const user = await prisma.businessUser.findUnique({
      where: { id: userId },
      include: { business: { select: { vertical: true, timezone: true } } },
    });
    if (!user) throw buildErr("User not found", 404, "NOT_FOUND");
    const { passwordHash, business, ...safeUser } = user as any;
    return {
      ...safeUser,
      vertical: business?.vertical ?? null,
      timezone: business?.timezone ?? null,
    };
  }

  async updatePreferredLanguage(
    userId: string,
    preferredLanguage: "en" | "ar",
  ) {
    return prisma.businessUser.update({
      where: { id: userId },
      data: { preferredLanguage },
      select: { preferredLanguage: true },
    });
  }

  async oauthSignIn({
    provider,
    providerId,
    email,
    name,
    emailVerified,
    preferredLanguage,
  }: OauthSignInInput) {
    if (!email) {
      throw buildErr("OAuth provider did not return an email", 400, "NO_EMAIL");
    }

    let user = await prisma.businessUser.findFirst({
      where: {
        OR: [{ email }, { provider, providerId }],
      },
    });

    if (!user) {
      user = await prisma.businessUser.create({
        data: {
          name: name || email.split("@")[0],
          email,
          provider,
          providerId,
          passwordHash: "",
          emailVerified: !!emailVerified,
          preferredLanguage: preferredLanguage ?? "en",
          role: Roles.User,
        },
      });
    } else {
      const updateData: Partial<typeof user> = {};
      if (!user.emailVerified && emailVerified) updateData.emailVerified = true;
      if (name && name !== user.name) updateData.name = name;
      if (preferredLanguage && preferredLanguage !== user.preferredLanguage) {
        updateData.preferredLanguage = preferredLanguage;
      }
      if (user.provider !== provider) {
        updateData.provider = provider;
        updateData.providerId = providerId;
      }
      if (Object.keys(updateData).length > 0) {
        user = await prisma.businessUser.update({
          where: { id: user.id },
          data: updateData,
        });
      }
    }

    setImmediate(() => {
      void prisma.businessUser.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    });

    const accessToken = signAccessToken({
      userId: user.id,
      businessId: user.businessId,
      role: user.role,
    });
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        businessId: user.businessId,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
      },
    };
  }
}

const authService = new AuthService();
export default authService;
