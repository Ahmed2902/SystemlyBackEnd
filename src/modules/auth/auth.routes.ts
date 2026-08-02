import { Router } from "express";
import authController from "./auth.controller";
import * as googleOauth from "./google.oauth";
import {
  authRateLimit,
  refreshRateLimit,
} from "../../shared/middleware/rateLimit.middleware";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import { csrfProtection } from "../../shared/middleware/CSRF";
import { doc } from "../../shared/middleware/doc.middleware";
import {
  registerBodySchema,
  loginBodySchema,
  emailBodySchema,
  refreshTokenBodySchema,
  resetPasswordBodySchema,
  verifyEmailQuerySchema,
  registerResponseSchema,
  loginResponseSchema,
  refreshResponseSchema,
  messageResponseSchema,
  resetPasswordResponseSchema,
  logoutResponseSchema,
  authUserSchema,
  updatePreferredLanguageBodySchema,
} from "./auth.schema";

const router = Router();

router.post(
  "/register",
  authRateLimit,
  doc({
    summary: "Register a new user",
    description:
      "Create a new account with name, email, password, and Egyptian phone number.",
    tags: ["auth"],
    security: false,
    responses: {
      201: { description: "Account created", schema: registerResponseSchema },
    },
  }),
  validate.validateBody(registerBodySchema),
  authController.register,
);

router.get(
  "/verify-email",
  doc({
    summary: "Verify email address",
    description: "Verify a user's email using the token sent to their inbox.",
    tags: ["auth"],
    security: false,
    responses: {
      200: { description: "Email verified", schema: loginResponseSchema },
    },
  }),
  validate.validateQuery(verifyEmailQuerySchema),
  authController.verifyEmail,
);

router.post(
  "/resend-verification",
  authRateLimit,
  doc({
    summary: "Resend verification email",
    description:
      "Resend the email verification link to the user's email address.",
    tags: ["auth"],
    security: false,
    responses: {
      200: {
        description: "Verification email sent",
        schema: messageResponseSchema,
      },
    },
  }),
  validate.validateBody(emailBodySchema),
  authController.resendVerification,
);

router.post(
  "/login",
  authRateLimit,
  doc({
    summary: "Login",
    description: "Authenticate with email and password to receive JWT tokens.",
    tags: ["auth"],
    security: false,
    responses: {
      200: { description: "Login successful", schema: loginResponseSchema },
    },
  }),
  validate.validateBody(loginBodySchema),
  authController.login,
);

router.get(
  "/oauth/google",
  doc({ summary: "Google OAuth redirect", tags: ["auth"], security: false }),
  googleOauth.googleRedirect,
);
router.get(
  "/oauth/google/callback",
  doc({ summary: "Google OAuth callback", tags: ["auth"], security: false }),
  googleOauth.googleCallback,
);

router.post(
  "/refresh",
  refreshRateLimit,
  csrfProtection,
  doc({
    summary: "Refresh access token",
    description: "Exchange the secure refresh cookie for a new access token.",
    tags: ["auth"],
    security: false,
    responses: {
      200: { description: "Token refreshed", schema: refreshResponseSchema },
    },
  }),
  validate.validateBody(refreshTokenBodySchema),
  authController.refresh,
);

router.post(
  "/logout",
  csrfProtection,
  doc({
    summary: "Logout",
    description: "Invalidate the current session.",
    tags: ["auth"],
    security: false,
    responses: {
      200: { description: "Logged out", schema: logoutResponseSchema },
    },
  }),
  authController.logout,
);

router.post(
  "/forgot-password",
  authRateLimit,
  doc({
    summary: "Forgot password",
    description: "Request a password reset link sent to the user's email.",
    tags: ["auth"],
    security: false,
    responses: {
      200: { description: "Reset link sent", schema: messageResponseSchema },
    },
  }),
  validate.validateBody(emailBodySchema),
  authController.forgotPassword,
);

router.post(
  "/reset-password",
  authRateLimit,
  doc({
    summary: "Reset password",
    description: "Set a new password using a valid reset token.",
    tags: ["auth"],
    security: false,
    responses: {
      200: {
        description: "Password updated",
        schema: resetPasswordResponseSchema,
      },
    },
  }),
  validate.validateBody(resetPasswordBodySchema),
  authController.resetPassword,
);

router.patch(
  "/preferences",
  requireAuth,
  csrfProtection,
  doc({
    summary: "Update platform language preference",
    description:
      "Persist the authenticated user's preferred Systemly platform language.",
    tags: ["auth"],
    responses: {
      200: { description: "Language preference updated" },
    },
  }),
  validate.validateBody(updatePreferredLanguageBodySchema),
  authController.updatePreferredLanguage,
);

router.get(
  "/me",
  requireAuth,
  doc({
    summary: "Get current user",
    description: "Return the authenticated user's profile.",
    tags: ["auth"],
    responses: {
      200: { description: "User profile", schema: authUserSchema },
    },
  }),
  authController.getMe,
);

router.get("/csrf-token", csrfProtection, (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  res.json({
    success: true,
    data: {
      csrfToken: req.csrfToken(),
    },
  });
});

export default router;
