import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  generateEmailToken,
  generateTokens,
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
import { date } from "zod";

const buildErr = (message: string, statusCode: number, code: string) => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

export const register = async (payload: RegisterBody) => {
  const { name, email, password, phone } = payload;
  const existing = await prisma.businessUser.findUnique({ where: { email } });
  if (existing) {
    throw buildErr(
      "An account with this email already exists",
      409,
      "EMAIL_TAKEN"
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.businessUser.create({
    data: {
      name,
      email,
      passwordHash,
      phone,
      role: Roles.User,
    },
  });

  // No business created at signup — do not create subscription or website content here

  const token = generateEmailToken();
  await redis.set(
    `email_verify:${token}`,
    user.email,
    AUTH_CONSTANTS.EMAIL_TOKEN_TTL_SECONDS
  );

  setImmediate(() => {
    void emailService.sendVerificationEmail(
      { name: user.name, email: user.email },
      token
    );
  });

  return { userId: user.id };
};

export const verifyEmail = async ({ token }: VerifyEmailQuery) => {
  const key = `email_verify:${token}`;
  const email = await redis.get(key);
  if (!email) {
    throw buildErr(
      "This verification link is invalid or has expired. Please request a new one.",
      400,
      "INVALID_TOKEN"
    );
  }
  const user = await prisma.businessUser.findUnique({ where: { email } });
  if (!user) throw buildErr("User not found", 404, "NOT_FOUND");

  await prisma.businessUser.update({
    where: { email: user.email },
    data: { emailVerified: true },
  });

  await redis.del(key);

  setImmediate(() => {
    void emailService.sendWelcomeEmail({ name: user.name, email: user.email });
  });

  const accessToken = signAccessToken({
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
  });
  const refreshTokenStr = await createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken: refreshTokenStr,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      businessId: user.businessId,
    },
  };
};

export const login = async (payload: LoginBody) => {
  const { email, password } = payload;
  const user = await prisma.businessUser.findUnique({ where: { email } });
  if (!user)
    throw buildErr("Invalid email or password", 401, "INVALID_CREDENTIALS");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw buildErr("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  if (!user.emailVerified) {
    const err: any = new Error(
      "Please verify your email before logging in. Check your inbox for the verification link."
    );
    err.statusCode = 403;
    err.code = "EMAIL_NOT_VERIFIED";
    err.details = { email: user.email };
    throw err;
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
  const refreshTokenStr = await createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken: refreshTokenStr,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      businessId: user.businessId,
    },
  };
};
export const createRefreshToken = async (userId: string) => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000
  );
  const row = await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });
  await prisma.businessUser.update({
    where: { id: userId },
    data: { currentRefreshTokenId: row.id },
  });
  return token;
};

export const revokeRefreshToken = async (token: string) => {
  const row = await prisma.refreshToken.findUnique({ where: { token } });
  if (!row) return false;
  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { revoked: true },
  });
  // clear current on user if it matches
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
};

export const rotateRefreshToken = async (oldToken: string) => {
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
      "INVALID_REFRESH_TOKEN"
    );
  }
  const userId = row.userId;
  // create new
  const newToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000
  );
  const newRow = await prisma.refreshToken.create({
    data: { userId, token: newToken, expiresAt },
  });
  // revoke old and set new as current
  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { revoked: true },
  });
  await prisma.businessUser.update({
    where: { id: userId },
    data: { currentRefreshTokenId: newRow.id },
  });
  return newToken;
};

export const refreshToken = async ({
  refreshToken,
}: RefreshTokenInput): Promise<{
  accessToken: string;
  refreshToken: string;
}> => {
  // validate and rotate
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
      "INVALID_REFRESH_TOKEN"
    );
  }
  const user = await prisma.businessUser.findUnique({
    where: { id: row.userId },
  });
  if (!user) throw buildErr("Invalid token user", 401, "INVALID_REFRESH_TOKEN");

  const newRefresh = await rotateRefreshToken(refreshToken);
  const accessToken = signAccessToken({
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
  });
  return { accessToken, refreshToken: newRefresh };
};

export const resendVerificationEmail = async ({ email }: EmailBody) => {
  const user = await prisma.businessUser.findUnique({ where: { email } });
  if (user && user.emailVerified)
    throw buildErr("This email is already verified.", 400, "ALREADY_VERIFIED");

  if (user) {
    const token = generateEmailToken();
    await redis.set(
      `email_verify:${token}`,
      user.email,
      AUTH_CONSTANTS.EMAIL_TOKEN_TTL_SECONDS
    );
    setImmediate(() => {
      void emailService.sendVerificationEmail(
        { name: user.name, email: user.email },
        token
      );
    });
  }

  return { sent: true };
};

export const forgotPassword = async ({ email }: EmailBody) => {
  const user = await prisma.businessUser.findUnique({ where: { email } });
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await redis.set(
      `pwd_reset:${token}`,
      user.id,
      AUTH_CONSTANTS.PWD_RESET_TTL_SECONDS
    );
    setImmediate(() => {
      void emailService.sendPasswordResetEmail(
        { name: user.name, email: user.email },
        token
      );
    });
  }
  return { sent: true };
};

export const resetPassword = async ({
  token,
  password: newPassword,
}: ResetPasswordBody) => {
  const key = `pwd_reset:${token}`;
  const userId = await redis.get(key);
  if (!userId) {
    throw buildErr(
      "This password reset link is invalid or has expired.",
      400,
      "INVALID_TOKEN"
    );
  }
  const user = await prisma.businessUser.findUnique({ where: { id: userId } });
  if (!user) throw buildErr("Invalid token user", 400, "INVALID_TOKEN");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.businessUser.update({
    where: { id: userId },
    data: { passwordHash },
  });
  await redis.del(key);

  return { success: true };
};

export const getMe = async ({ userId }: GetMeInput) => {
  const user = await prisma.businessUser.findUnique({ where: { id: userId } });
  if (!user) throw buildErr("User not found", 404, "NOT_FOUND");
  const { passwordHash, ...safeUser } = user as any;
  return safeUser;
};

export const oauthSignIn = async ({
  provider,
  providerId,
  email,
  name,
  picture,
  emailVerified,
}: OauthSignInInput) => {
  if (!email) {
    throw buildErr("OAuth provider did not return an email", 400, "NO_EMAIL");
  }

  /* -------------------------
     FIND USER SAFELY
  -------------------------- */
  let user = await prisma.businessUser.findFirst({
    where: {
      OR: [{ email }, { provider, providerId }],
    },
  });

  /* -------------------------
     CREATE USER
  -------------------------- */
  if (!user) {
    user = await prisma.businessUser.create({
      data: {
        name: name || email.split("@")[0],
        email,
        provider,
        providerId,
        passwordHash: "",
        emailVerified: !!emailVerified,
        role: Roles.User,
      },
    });
  } else {
    /* -------------------------
       UPDATE USER INFO
    -------------------------- */
    const updateData: Partial<typeof user> = {};

    if (!user.emailVerified && emailVerified) {
      updateData.emailVerified = true;
    }

    if (name && name !== user.name) {
      updateData.name = name;
    }

    if (user.provider !== provider) {
      updateData.provider = provider;
      updateData.providerId = providerId;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.businessUser.update({
        where: { id: user.id },
        data: updateData,
      });
    }
  }

  /* -------------------------
     UPDATE LAST LOGIN (NON-BLOCKING)
  -------------------------- */
  setImmediate(() => {
    void prisma.businessUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  });

  /* -------------------------
     TOKENS
  -------------------------- */
  const accessToken = signAccessToken({
    userId: user.id,
    businessId: user.businessId,
    role: user.role,
  });

  const refreshToken = await createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      businessId: user.businessId,
    },
  };
};

class AuthService {
  register = register;
  verifyEmail = verifyEmail;
  login = login;
  revokeRefreshToken = revokeRefreshToken;
  refreshToken = refreshToken;
  resendVerificationEmail = resendVerificationEmail;
  forgotPassword = forgotPassword;
  resetPassword = resetPassword;
  getMe = getMe;
  oauthSignIn = oauthSignIn;
}

const authService = new AuthService();
export default authService;
