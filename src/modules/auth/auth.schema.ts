import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

const normalizedEmailSchema = z
  .email()
  .transform((value) => value.toLowerCase().trim());

const internationalPhoneSchema = z
  .string()
  .min(4)
  .refine((val) => {
    try {
      const p = parsePhoneNumberFromString(val);
      return !!p && p.isValid();
    } catch (e) {
      return false;
    }
  }, "Invalid phone number");
export const registerBodySchema = z.object({
  name: z.string().min(2).max(100),
  email: normalizedEmailSchema,
  password: z.string().min(8).max(100),
  phone: internationalPhoneSchema,
});

export const loginBodySchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1),
});

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1),
});

export const emailBodySchema = z.object({
  email: normalizedEmailSchema,
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
});

export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const refreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1),
});

export const getMeInputSchema = z.object({
  userId: z.string().min(1),
});

export const oauthSignInInputSchema = z.object({
  provider: z.string().min(1),
  providerId: z.string().min(1),
  email: normalizedEmailSchema.nullable(),
  name: z.string().optional().nullable(),
  picture: z.url().optional().nullable(),
  emailVerified: z.boolean().optional(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;
export type EmailBody = z.infer<typeof emailBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type RefreshTokenBody = z.infer<typeof refreshTokenBodySchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenInputSchema>;
export type GetMeInput = z.infer<typeof getMeInputSchema>;
export type OauthSignInInput = z.infer<typeof oauthSignInInputSchema>;

export const authSchemas = {
  registerBodySchema,
  loginBodySchema,
  verifyEmailQuerySchema,
  emailBodySchema,
  resetPasswordBodySchema,
  refreshTokenBodySchema,
  refreshTokenInputSchema,
  getMeInputSchema,
  oauthSignInInputSchema,
};
