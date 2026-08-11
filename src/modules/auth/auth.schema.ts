import { z } from "zod";

const egyptPhone = /^(010|011|012|015)\d{8}$/;

export const platformLanguageSchema = z.enum(["en", "ar"]);

const normalizedEmailSchema = z
  .string()
  .email()
  .transform((value) => value.toLowerCase().trim());

export const registerBodySchema = z
  .object({
    name: z.string().min(2).max(100).openapi({
      example: "Ahmed Hassan",
      description: "Full name of the user",
    }),
    email: normalizedEmailSchema.openapi({
      example: "ahmed@example.com",
      description: "User email address",
    }),
    password: z.string().min(8).max(100).openapi({
      example: "securePass123",
      description: "Password (min 8 chars)",
    }),
    phone: z
      .string()
      .regex(egyptPhone, "Invalid Egyptian phone number")
      .openapi({
        example: "01012345678",
        description: "Egyptian mobile number",
      }),
    preferredLanguage: platformLanguageSchema.optional().openapi({
      example: "ar",
      description: "Preferred language for the authenticated Systemly platform",
    }),
    inviteToken: z.string().min(1).max(512).optional().openapi({
      description: "Optional receptionist invitation token to continue after email verification",
    }),
  })
  .openapi({ description: "User registration payload" });

export const loginBodySchema = z
  .object({
    email: normalizedEmailSchema.openapi({ example: "ahmed@example.com" }),
    password: z.string().min(1).openapi({ example: "securePass123" }),
  })
  .openapi({ description: "User login payload" });

export const verifyEmailQuerySchema = z
  .object({
    token: z.string().min(1).openapi({ example: "abc123token" }),
  })
  .openapi({ description: "Email verification token" });

export const emailBodySchema = z
  .object({
    email: normalizedEmailSchema.openapi({ example: "ahmed@example.com" }),
    inviteToken: z.string().min(1).max(512).optional().openapi({
      description: "Optional receptionist invitation token to preserve verification continuation",
    }),
  })
  .openapi({ description: "Email address for password reset / verification" });

export const resetPasswordBodySchema = z
  .object({
    token: z.string().min(1).openapi({ example: "reset-token-xyz" }),
    password: z
      .string()
      .min(8)
      .max(100)
      .openapi({ example: "newSecurePass456" }),
  })
  .openapi({ description: "Password reset payload" });

export const updatePreferredLanguageBodySchema = z
  .object({
    preferredLanguage: platformLanguageSchema.openapi({ example: "ar" }),
  })
  .strict()
  .openapi({ description: "Authenticated user's preferred platform language" });

// The refresh token is accepted only from the secure HTTP-only cookie.
export const refreshTokenBodySchema = z
  .object({})
  .openapi({ description: "Refresh the current cookie-backed session" });

export const refreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1).openapi({ example: "refresh-token-abc" }),
});

export const getMeInputSchema = z.object({
  userId: z.string().min(1).openapi({ example: "user-123" }),
});

export const oauthSignInInputSchema = z.object({
  provider: z.string().min(1).openapi({ example: "google" }),
  providerId: z.string().min(1).openapi({ example: "google-oauth-id-123" }),
  email: normalizedEmailSchema
    .nullable()
    .openapi({ example: "user@gmail.com" }),
  name: z.string().optional().nullable().openapi({ example: "Ahmed Hassan" }),
  picture: z
    .string()
    .url()
    .optional()
    .nullable()
    .openapi({ example: "https://lh3.googleusercontent.com/photo.jpg" }),
  emailVerified: z.boolean().optional().openapi({ example: true }),
  preferredLanguage: platformLanguageSchema.optional().openapi({ example: "ar" }),
});

export const registerResponseSchema = z
  .object({
    userId: z.string().openapi({ example: "user-abc123" }),
    message: z.string().openapi({
      example:
        "Account created. Please check your email to verify your account.",
    }),
  })
  .openapi({ description: "Registration response" });

export const authUserSchema = z
  .object({
    id: z.string().openapi({ example: "user-abc123" }),
    name: z.string().openapi({ example: "Ahmed Hassan" }),
    email: z.string().email().openapi({ example: "ahmed@example.com" }),
    businessId: z.string().nullable().openapi({ example: "biz-123" }),
    role: z.string().openapi({ example: "BusinessAdmin" }),
    preferredLanguage: platformLanguageSchema.openapi({ example: "ar" }),
    vertical: z.string().nullable().optional().openapi({ example: "salon" }),
    timezone: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: "Africa/Cairo" }),
  })
  .openapi({ description: "Authenticated user info" });

export const loginResponseSchema = z
  .object({
    accessToken: z.string().openapi({ example: "eyJhbGciOiJIUzI1NiIs..." }),
    user: authUserSchema,
  })
  .openapi({ description: "Login / verify-email response" });

export const refreshResponseSchema = z
  .object({
    accessToken: z.string().openapi({ example: "eyJhbGciOiJIUzI1NiIs..." }),
  })
  .openapi({ description: "Token refresh response" });

export const messageResponseSchema = z
  .object({
    sent: z.boolean().openapi({ example: true }),
    message: z.string().openapi({
      example:
        "If this email is registered, a verification link has been sent.",
    }),
  })
  .openapi({ description: "Generic message response" });

export const resetPasswordResponseSchema = z
  .object({
    success: z.boolean().openapi({ example: true }),
    message: z
      .string()
      .openapi({ example: "Password updated. You can now log in." }),
  })
  .openapi({ description: "Password reset response" });

export const logoutResponseSchema = z
  .object({
    message: z.string().openapi({ example: "Logged out successfully" }),
  })
  .openapi({ description: "Logout response" });

export type PlatformLanguage = z.infer<typeof platformLanguageSchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;
export type EmailBody = z.infer<typeof emailBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type UpdatePreferredLanguageBody = z.infer<
  typeof updatePreferredLanguageBodySchema
>;
export type RefreshTokenInput = z.infer<typeof refreshTokenInputSchema>;
export type GetMeInput = z.infer<typeof getMeInputSchema>;
export type OauthSignInInput = z.infer<typeof oauthSignInInputSchema>;

export const authSchemas = {
  platformLanguageSchema,
  registerBodySchema,
  loginBodySchema,
  verifyEmailQuerySchema,
  emailBodySchema,
  resetPasswordBodySchema,
  updatePreferredLanguageBodySchema,
  refreshTokenBodySchema,
  refreshTokenInputSchema,
  getMeInputSchema,
  oauthSignInInputSchema,
};
