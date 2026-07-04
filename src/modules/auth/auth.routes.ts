import { Router } from "express";
import authController from "./auth.controller";
import * as googleOauth from "./google.oauth";
import * as appleOauth from "./apple.oauth";
import { authRateLimit } from "../../shared/middleware/rateLimit.middleware";
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
} from "./auth.schema";

const router = Router();

/* -------------------------
   AUTH (PUBLIC)
-------------------------- */
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

/* -------------------------
   OAUTH (NO CSRF HERE)
-------------------------- */
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

router.get(
  "/oauth/apple",
  doc({ summary: "Apple OAuth redirect", tags: ["auth"], security: false }),
  appleOauth.appleRedirect,
);
router.post(
  "/oauth/apple/callback",
  doc({ summary: "Apple OAuth callback", tags: ["auth"], security: false }),
  appleOauth.appleCallback,
);

/* -------------------------
   TOKEN MANAGEMENT
-------------------------- */
router.post(
  "/refresh",
  authRateLimit,
  csrfProtection,
  doc({
    summary: "Refresh access token",
    description: "Exchange a valid refresh token for a new access token.",
    tags: ["auth"],
    security: false,
    responses: {
      200: { description: "Token refreshed", schema: refreshResponseSchema },
    },
  }),
  validate.validateBody(refreshTokenBodySchema),
  authController.refresh,
);

/* -------------------------
   LOGOUT
-------------------------- */
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

/* -------------------------
   PASSWORD RESET FLOW
-------------------------- */
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

/* -------------------------
   AUTH USER
-------------------------- */
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

export default router;
