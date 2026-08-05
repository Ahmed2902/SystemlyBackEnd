import bcrypt from "bcryptjs";
import { Prisma, Roles } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { Errors } from "../../shared/errors/application-error";
import * as emailService from "../../shared/services/email.service";
import { signAccessToken } from "../../shared/utils/token.util";
import {
  AUTH_TOKEN_PURPOSES,
  authActionTokens,
} from "./auth-action-token.repository";
import { authSessions } from "./auth-session.service";
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

const AUTH_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  phoneVerified: true,
  emailVerified: true,
  preferredLanguage: true,
  businessId: true,
  role: true,
  provider: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  business: { select: { vertical: true, timezone: true } },
} satisfies Prisma.BusinessUserSelect;

type AuthUser = Prisma.BusinessUserGetPayload<{
  select: typeof AUTH_USER_SELECT;
}>;

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    emailVerified: user.emailVerified,
    preferredLanguage: user.preferredLanguage,
    businessId: user.businessId,
    role: user.role,
    provider: user.provider,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    vertical: user.business?.vertical ?? null,
    timezone: user.business?.timezone ?? null,
  };
}

function accessTokenFor(user: Pick<AuthUser, "id" | "businessId" | "role">) {
  return signAccessToken({
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
  });
}

class AuthService {
  async register(payload: RegisterBody) {
    const existing = await prisma.businessUser.findUnique({
      where: { email: payload.email },
      select: { id: true },
    });
    if (existing) {
      throw Errors.conflict(
        "An account with this email already exists.",
        "EMAIL_TAKEN",
      );
    }

    const user = await prisma.businessUser.create({
      data: {
        name: payload.name,
        email: payload.email,
        passwordHash: await bcrypt.hash(payload.password, 12),
        phone: payload.phone,
        preferredLanguage: payload.preferredLanguage ?? "en",
        role: Roles.User,
      },
      select: {
        id: true,
        name: true,
        email: true,
        preferredLanguage: true,
      },
    });

    const token = await authActionTokens.issue(
      user.id,
      AUTH_TOKEN_PURPOSES.EMAIL_VERIFICATION,
    );
    await emailService.enqueueVerificationEmail(user, token, {
      idempotencyKey: `verification:${user.id}:${token}`,
    });

    return { userId: user.id };
  }

  async verifyEmail({ token }: VerifyEmailQuery) {
    const user = await prisma.$transaction(async (tx) => {
      const userId = await authActionTokens.consume(
        tx,
        AUTH_TOKEN_PURPOSES.EMAIL_VERIFICATION,
        token,
      );
      if (!userId) {
        throw Errors.badRequest(
          "This verification link is invalid or has expired. Please request a new one.",
          "INVALID_TOKEN",
        );
      }

      return tx.businessUser.update({
        where: { id: userId },
        data: { emailVerified: true },
        select: AUTH_USER_SELECT,
      });
    });

    await emailService.enqueueWelcomeEmail(user, {
      idempotencyKey: `welcome:${user.id}`,
    });
    const refreshToken = await authSessions.create(user.id);

    return {
      accessToken: accessTokenFor(user),
      refreshToken,
      user: publicUser(user),
    };
  }

  async login(payload: LoginBody) {
    const userWithPassword = await prisma.businessUser.findUnique({
      where: { email: payload.email },
      select: { ...AUTH_USER_SELECT, passwordHash: true },
    });
    if (
      !userWithPassword ||
      !userWithPassword.passwordHash ||
      !(await bcrypt.compare(payload.password, userWithPassword.passwordHash))
    ) {
      throw Errors.unauthorized(
        "Invalid email or password.",
        "INVALID_CREDENTIALS",
      );
    }
    if (!userWithPassword.emailVerified) {
      const error = Errors.forbidden(
        "Please verify your email before logging in. Check your inbox for the verification link.",
        "EMAIL_NOT_VERIFIED",
      );
      Object.assign(error, { details: { email: userWithPassword.email } });
      throw error;
    }

    const user = await prisma.businessUser.update({
      where: { id: userWithPassword.id },
      data: { lastLoginAt: new Date() },
      select: AUTH_USER_SELECT,
    });
    const refreshToken = await authSessions.create(user.id);

    return {
      accessToken: accessTokenFor(user),
      refreshToken,
      user: publicUser(user),
    };
  }

  createRefreshToken(userId: string) {
    return authSessions.create(userId);
  }

  revokeRefreshToken(token: string) {
    return authSessions.revoke(token);
  }

  async rotateRefreshToken(token: string) {
    return (await authSessions.rotate(token)).token;
  }

  async refreshToken({ refreshToken }: RefreshTokenInput) {
    const rotated = await authSessions.rotate(refreshToken);
    const user = await prisma.businessUser.findUnique({
      where: { id: rotated.userId },
      select: AUTH_USER_SELECT,
    });
    if (!user) {
      throw Errors.unauthorized(
        "Invalid refresh-token user.",
        "INVALID_REFRESH_TOKEN",
      );
    }

    return {
      accessToken: accessTokenFor(user),
      refreshToken: rotated.token,
    };
  }

  async resendVerificationEmail({ email }: EmailBody) {
    const user = await prisma.businessUser.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        preferredLanguage: true,
      },
    });
    if (user?.emailVerified) {
      throw Errors.badRequest(
        "This email is already verified.",
        "ALREADY_VERIFIED",
      );
    }

    if (user) {
      const token = await authActionTokens.issue(
        user.id,
        AUTH_TOKEN_PURPOSES.EMAIL_VERIFICATION,
      );
      await emailService.enqueueVerificationEmail(user, token, {
        idempotencyKey: `verification:${user.id}:${token}`,
      });
    }

    return { sent: true };
  }

  async forgotPassword({ email }: EmailBody) {
    const user = await prisma.businessUser.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        preferredLanguage: true,
      },
    });
    if (user) {
      const token = await authActionTokens.issue(
        user.id,
        AUTH_TOKEN_PURPOSES.PASSWORD_RESET,
      );
      await emailService.enqueuePasswordResetEmail(user, token, {
        idempotencyKey: `password-reset:${user.id}:${token}`,
      });
    }
    return { sent: true };
  }

  async resetPassword({ token, password }: ResetPasswordBody) {
    await prisma.$transaction(async (tx) => {
      const userId = await authActionTokens.consume(
        tx,
        AUTH_TOKEN_PURPOSES.PASSWORD_RESET,
        token,
      );
      if (!userId) {
        throw Errors.badRequest(
          "This password reset link is invalid or has expired.",
          "INVALID_TOKEN",
        );
      }

      await tx.businessUser.update({
        where: { id: userId },
        data: { passwordHash: await bcrypt.hash(password, 12) },
      });
      await authSessions.revokeAll(userId, tx);
    });

    return { success: true };
  }

  async getMe({ userId }: GetMeInput) {
    const user = await prisma.businessUser.findUnique({
      where: { id: userId },
      select: AUTH_USER_SELECT,
    });
    if (!user) throw Errors.notFound("User not found.");
    return publicUser(user);
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

  async oauthSignIn(input: OauthSignInInput) {
    if (!input.email) {
      throw Errors.badRequest(
        "OAuth provider did not return an email.",
        "NO_EMAIL",
      );
    }

    const providerIdentity = await prisma.businessUser.findFirst({
      where: { provider: input.provider, providerId: input.providerId },
      select: AUTH_USER_SELECT,
    });
    let user: AuthUser;

    if (providerIdentity) {
      user = await prisma.businessUser.update({
        where: { id: providerIdentity.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.emailVerified ? { emailVerified: true } : {}),
          ...(input.preferredLanguage
            ? { preferredLanguage: input.preferredLanguage }
            : {}),
          lastLoginAt: new Date(),
        },
        select: AUTH_USER_SELECT,
      });
    } else {
      const emailOwner = await prisma.businessUser.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (emailOwner) {
        throw Errors.conflict(
          "An account already uses this email. Sign in first to link the OAuth provider.",
          "OAUTH_ACCOUNT_LINK_REQUIRED",
        );
      }

      user = await prisma.businessUser.create({
        data: {
          name: input.name || input.email.split("@")[0],
          email: input.email,
          provider: input.provider,
          providerId: input.providerId,
          passwordHash: "",
          emailVerified: Boolean(input.emailVerified),
          preferredLanguage: input.preferredLanguage ?? "en",
          role: Roles.User,
          lastLoginAt: new Date(),
        },
        select: AUTH_USER_SELECT,
      });
    }

    const refreshToken = await authSessions.create(user.id);
    return {
      accessToken: accessTokenFor(user),
      refreshToken,
      user: publicUser(user),
    };
  }
}

const authService = new AuthService();
export default authService;
