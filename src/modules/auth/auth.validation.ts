import { z } from "zod";
import type {
  EmailBody,
  LoginBody,
  RefreshTokenBody,
  RefreshTokenInput,
  RegisterBody,
  ResetPasswordBody,
  VerifyEmailQuery,
} from "./auth.schema";

const egyptPhone = /^(010|011|012|015)\d{8}$/;

const normalizedEmail = z
  .string()
  .email()
  .transform((value) => value.toLowerCase().trim());

export const registerBodySchema = z.object({
  name: z.string().min(2).max(100),
  email: normalizedEmail,
  password: z.string().min(8).max(100),
  phone: z.string().regex(egyptPhone, "Invalid Egyptian phone number"),
});

export const loginBodySchema = z.object({
  email: normalizedEmail,
  password: z.string().min(1),
});

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1),
});

export const emailBodySchema = z.object({
  email: normalizedEmail,
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(100),
});

export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

// export const parseRegisterBody = (input: unknown): RegisterBody =>
//   registerBodySchema.parse(input);

// export const parseLoginBody = (input: unknown): LoginBody =>
//   loginBodySchema.parse(input);

// export const parseVerifyEmailQuery = (input: unknown): VerifyEmailQuery =>
//   verifyEmailQuerySchema.parse(input);

// export const parseEmailBody = (input: unknown): EmailBody =>
//   emailBodySchema.parse(input);

// export const parseResetPasswordBody = (input: unknown): ResetPasswordBody =>
//   resetPasswordBodySchema.parse(input);

// export const parseRefreshTokenBody = (input: unknown): RefreshTokenBody =>
//   refreshTokenBodySchema.parse(input);

// export const parseRefreshTokenInput = (
//   body: unknown,
//   cookieRefreshToken?: string
// ): RefreshTokenInput => {
//   const parsedBody = parseRefreshTokenBody(body);
//   const refreshToken = cookieRefreshToken || parsedBody.refreshToken;

//   if (!refreshToken) {
//     throw new z.ZodError([
//       {
//         code: "custom",
//         message: "No refresh token",
//         path: ["refreshToken"],
//       },
//     ]);
//   }

//   return { refreshToken };
// };
