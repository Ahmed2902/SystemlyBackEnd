import type { NextFunction, Request, Response } from "express";
import authService from "./auth.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  emailBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyEmailQuerySchema,
  refreshTokenInputSchema,
  getMeInputSchema,
} from "./auth.schema";

const REFRESH_COOKIE_NAME = "refreshToken";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  // When frontend is hosted on a different domain (production), use SameSite=None
  sameSite:
    process.env.NODE_ENV === "production"
      ? ("none" as const)
      : ("strict" as const),
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = registerBodySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await authService.register(parsed.data);
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
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = verifyEmailQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      const result = await authService.verifyEmail(parsed.data);
      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        REFRESH_COOKIE_OPTIONS,
      );
      res.cookie("accessToken", result.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 15 * 60 * 1000, // match your actual access token expiry
        path: "/",
      });
      return ok(res, { accessToken: result.accessToken, user: result.user });
    } catch (err) {
      return next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = loginBodySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await authService.login(parsed.data);
      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        REFRESH_COOKIE_OPTIONS,
      );
      res.cookie("accessToken", result.accessToken, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 15 * 60 * 1000, // match your actual access token expiry
        path: "/",
      });
      return ok(res, { accessToken: result.accessToken, user: result.user });
    } catch (err) {
      return next(err);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshTokenSource =
        (req as any).cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
      const parsed = refreshTokenInputSchema.safeParse({
        refreshToken: refreshTokenSource,
      });
      if (!parsed.success)
        return fail(res, "No refresh token", 401, "UNAUTHORIZED");
      const result = await authService.refreshToken(parsed.data);
      res.cookie(
        REFRESH_COOKIE_NAME,
        result.refreshToken,
        REFRESH_COOKIE_OPTIONS,
      );
      return ok(res, { accessToken: result.accessToken });
    } catch (err) {
      return next(err);
    }
  }

  async resendVerification(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = emailBodySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await authService.resendVerificationEmail(parsed.data);
      return ok(res, {
        sent: result.sent,
        message:
          "If this email is registered, a verification link has been sent.",
      });
    } catch (err) {
      return next(err);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = emailBodySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await authService.forgotPassword(parsed.data);
      return ok(res, {
        sent: result.sent,
        message:
          "If this email is registered, a password reset link has been sent.",
      });
    } catch (err) {
      return next(err);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = resetPasswordBodySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await authService.resetPassword(parsed.data);
      return ok(res, {
        success: result.success,
        message: "Password updated. You can now log in.",
      });
    } catch (err) {
      return next(err);
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const refreshToken = (req as any).cookies?.[REFRESH_COOKIE_NAME];
      if (refreshToken) await authService.revokeRefreshToken(refreshToken);
    } catch {
      // ignore revoke errors
    }
    res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
    return ok(res, { message: "Logged out successfully" });
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = getMeInputSchema.safeParse({
        userId: (req as any).user?.id,
      });
      if (!parsed.success)
        return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const safeUser = await authService.getMe(parsed.data);
      res.set("Cache-Control", "no-store");
      return ok(res, safeUser);
    } catch (err) {
      return next(err);
    }
  }
}

export default new AuthController();
