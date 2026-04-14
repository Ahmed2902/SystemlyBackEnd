import { Router } from "express";
import * as authController from "./auth.controller";
import * as googleOauth from "./google.oauth";
import * as appleOauth from "./apple.oauth";
import { authRateLimit } from "../../shared/middleware/rateLimit.middleware";
import { requireAuth } from "../../shared/middleware/auth.middleware";

const router = Router();

router.post("/register", authRateLimit, authController.register);
router.get("/verify-email", authController.verifyEmail);

router.post(
  "/resend-verification",
  authRateLimit,
  authController.resendVerification
);
router.post("/login", authRateLimit, authController.login);
// OAuth providers
router.get("/oauth/google", googleOauth.googleRedirect);
router.get("/oauth/google/callback", googleOauth.googleCallback);
router.get("/oauth/apple", appleOauth.appleRedirect);
router.post("/oauth/apple/callback", appleOauth.appleCallback);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/forgot-password", authRateLimit, authController.forgotPassword);
router.post("/reset-password", authRateLimit, authController.resetPassword);
router.get("/me", requireAuth, authController.getMe);

export default router;
