import crypto from "node:crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import { APP_CONFIG } from "../config/config";
import { Errors } from "../errors/application-error";
import { ok } from "../utils/response.util";

export const CSRF_COOKIE_NAME = "_systemly_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";
const TOKEN_VERSION = "v1";
const TOKEN_TTL_MS = 2 * 60 * 60 * 1_000;

function csrfSecret(): string {
  const value = process.env.CSRF_SECRET;
  if (value) return value;
  if (!APP_CONFIG.isProduction) return "systemly-development-csrf-secret";
  throw new Error("CSRF_SECRET is required in production");
}

function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: APP_CONFIG.isProduction,
    sameSite: APP_CONFIG.isProduction ? "none" : "lax",
    maxAge: TOKEN_TTL_MS,
    path: "/api/auth",
  };
}

function sign(unsignedToken: string): string {
  return crypto
    .createHmac("sha256", csrfSecret())
    .update(unsignedToken)
    .digest("base64url");
}

export function createCsrfToken(now = Date.now()): string {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const unsignedToken = `${TOKEN_VERSION}.${now}.${nonce}`;
  return `${unsignedToken}.${sign(unsignedToken)}`;
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyCsrfToken(token: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 4) return false;

  const [version, timestampValue, nonce, signature] = parts;
  if (version !== TOKEN_VERSION || !nonce || !signature) return false;

  const timestamp = Number(timestampValue);
  if (!Number.isFinite(timestamp)) return false;
  if (timestamp > now + 60_000 || now - timestamp > TOKEN_TTL_MS) return false;

  const unsignedToken = `${version}.${timestampValue}.${nonce}`;
  return timingSafeEqual(signature, sign(unsignedToken));
}

function requestOrigin(req: Request): string | null {
  const value = req.get("origin");
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function hasAllowedOrigin(req: Request): boolean {
  const origin = requestOrigin(req);
  if (!origin) return false;
  return APP_CONFIG.corsOrigins.includes(origin);
}

export function issueCsrfToken(_req: Request, res: Response) {
  const token = createCsrfToken();
  res.set("Cache-Control", "no-store");
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  return ok(res, { csrfToken: token });
}

export function clearCsrfCookie(res: Response) {
  res.clearCookie(CSRF_COOKIE_NAME, csrfCookieOptions());
}

export function csrfProtection(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    if (!hasAllowedOrigin(req)) {
      return next(
        Errors.forbidden(
          "The request origin is not allowed.",
          "CSRF_ORIGIN_DENIED",
        ),
      );
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.get(CSRF_HEADER_NAME);
    if (
      typeof cookieToken !== "string" ||
      typeof headerToken !== "string" ||
      !timingSafeEqual(cookieToken, headerToken) ||
      !verifyCsrfToken(headerToken)
    ) {
      return next(
        Errors.forbidden("Invalid or expired CSRF token.", "CSRF_INVALID"),
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
