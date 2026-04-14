import type { NextFunction, Request, Response } from "express";
import * as authService from "./auth.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  parseEmailBody,
  parseLoginBody,
  parseRefreshTokenInput,
  parseRegisterBody,
  parseResetPasswordBody,
  parseVerifyEmailQuery,
} from "./auth.validation";

const REFRESH_COOKIE_NAME = "refreshToken";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload = parseRegisterBody(req.body);
    const result = await authService.register(payload);
    return res.status(201).json({
      success: true,
      data: {
        userId: result.userId,
        message:
          "Account created. Please check your email to verify your account.",
      },
    });
  } catch (err) {
    return next(err);
  }
};

export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const query = parseVerifyEmailQuery(req.query);
    const result = await authService.verifyEmail(query);
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS
    );
    return ok(res, { accessToken: result.accessToken, user: result.user });
  } catch (err) {
    return next(err);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload = parseLoginBody(req.body);
    const result = await authService.login(payload);
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS
    );
    return ok(res, { accessToken: result.accessToken, user: result.user });
  } catch (err) {
    return next(err);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const refreshToken =
      (req as any).cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!refreshToken)
      return fail(res, "No refresh token", 401, "UNAUTHORIZED");
    const result = await authService.refreshToken({ refreshToken });
    // set rotated refresh token cookie
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS
    );
    return ok(res, { accessToken: result.accessToken });
  } catch (err) {
    return next(err);
  }
};

export const resendVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload = parseEmailBody(req.body);
    const result = await authService.resendVerificationEmail(payload);
    return ok(res, {
      sent: result.sent,
      message:
        "If this email is registered, a verification link has been sent.",
    });
  } catch (err) {
    return next(err);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload = parseEmailBody(req.body);
    const result = await authService.forgotPassword(payload);
    return ok(res, {
      sent: result.sent,
      message:
        "If this email is registered, a password reset link has been sent.",
    });
  } catch (err) {
    return next(err);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payload = parseResetPasswordBody(req.body);
    const result = await authService.resetPassword(payload);
    return ok(res, {
      success: result.success,
      message: "Password updated. You can now log in.",
    });
  } catch (err) {
    return next(err);
  }
};

export const logout = async (_req: Request, res: Response) => {
  try {
    const refreshToken = (_req as any).cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await authService.revokeRefreshToken(refreshToken);
    }
  } catch (err) {
    // ignore revoke errors
  }
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  return ok(res, { message: "Logged out successfully" });
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    const safeUser = await authService.getMe({ userId });
    return ok(res, safeUser);
  } catch (err) {
    return next(err);
  }
};

export default {
  register,
  verifyEmail,
  login,
  refresh,
  resendVerification,
  forgotPassword,
  resetPassword,
  logout,
  getMe,
};
