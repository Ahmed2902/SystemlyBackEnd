import { Router } from "express";
import * as authController from "./auth.controller";
import * as googleOauth from "./google.oauth";
import * as appleOauth from "./apple.oauth";
import { authRateLimit } from "../../shared/middleware/rateLimit.middleware";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import {
  registerBodySchema,
  loginBodySchema,
  emailBodySchema,
  refreshTokenBodySchema,
  resetPasswordBodySchema,
  verifyEmailQuerySchema,
} from "./auth.schema";

const router = Router();

router.post(
  "/register",
  authRateLimit,
  validate.validateBody(registerBodySchema),
  authController.register
);
router.get(
  "/verify-email",
  validate.validateQuery(verifyEmailQuerySchema),
  authController.verifyEmail
);

router.post(
  "/resend-verification",
  authRateLimit,
  validate.validateBody(emailBodySchema),
  authController.resendVerification
);
router.post(
  "/login",
  authRateLimit,
  validate.validateBody(loginBodySchema),
  authController.login
);
// OAuth providers
router.get("/oauth/google", googleOauth.googleRedirect);
router.get("/oauth/google/callback", googleOauth.googleCallback);
router.get("/oauth/apple", appleOauth.appleRedirect);
router.post("/oauth/apple/callback", appleOauth.appleCallback);
router.post(
  "/refresh",
  validate.validateBody(refreshTokenBodySchema),
  authController.refresh
);
router.post("/logout", authController.logout);
router.post(
  "/forgot-password",
  authRateLimit,
  validate.validateBody(emailBodySchema),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  authRateLimit,
  validate.validateBody(resetPasswordBodySchema),
  authController.resetPassword
);
router.get("/me", requireAuth, authController.getMe);

export default router;
