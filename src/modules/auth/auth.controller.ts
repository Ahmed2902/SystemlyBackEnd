import type { CookieOptions, NextFunction, Request, Response } from "express";
import { AUTH_CONSTANTS } from "../../shared/config/config";
import { fail, ok } from "../../shared/utils/response.util";
import { resolveSubscriptionAccess } from "../subscriptions/subscription-access.service";
import {
  emailBodySchema,
  getMeInputSchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyEmailQuerySchema,
} from "./auth.schema";
import authService from "./auth.service";

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000,
  path: "/",
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

async function withSubscriptionAccess<T extends {
  businessId?: string | null;
  role?: string | null;
}>(user: T) {
  if (!user.businessId) {
    return { ...user, subscriptionAccess: null };
  }

  return {
    ...user,
    subscriptionAccess: await resolveSubscriptionAccess(
      user.businessId,
      user.role ?? null,
    ),
  };
}

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
    } catch (error) {
      return next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = verifyEmailQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      const result = await authService.verifyEmail(parsed.data);
      setRefreshCookie(res, result.refreshToken);
      const user = await withSubscriptionAccess(
        await authService.getMe({ userId: result.user.id }),
      );
      return ok(res, { accessToken: result.accessToken, user });
    } catch (error) {
      return next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = loginBodySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await authService.login(parsed.data);
      setRefreshCookie(res, result.refreshToken);
      const user = await withSubscriptionAccess(
        await authService.getMe({ userId: result.user.id }),
      );
      return ok(res, { accessToken: result.accessToken, user });
    } catch (error) {
      return next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (typeof refreshToken !== "string" || !refreshToken) {
        return fail(res, "No refresh token", 401, "UNAUTHORIZED");
      }
      const result = await authService.refreshToken({ refreshToken });
      setRefreshCookie(res, result.refreshToken);
      return ok(res, { accessToken: result.accessToken });
    } catch (error) {
      if (errorCode(error) === "INVALID_REFRESH_TOKEN") {
        clearRefreshCookie(res);
      }
      return next(error);
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
    } catch (error) {
      return next(error);
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
    } catch (error) {
      return next(error);
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
    } catch (error) {
      return next(error);
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (typeof refreshToken === "string" && refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
      }
    } catch {
      // Clearing the browser cookie still signs the user out locally.
    }
    clearRefreshCookie(res);
    return ok(res, { message: "Logged out successfully" });
  }

  async getMe(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = getMeInputSchema.safeParse({ userId: req.user?.id });
      if (!parsed.success) {
        return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      }
      const user = await withSubscriptionAccess(
        await authService.getMe(parsed.data),
      );
      res.set("Cache-Control", "no-store");
      return ok(res, user);
    } catch (error) {
      return next(error);
    }
  }
}

export default new AuthController();
