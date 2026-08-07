import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { JWT } from "../config/config";

type JwtSignOptions = Readonly<{
  algorithm: "HS256";
  expiresIn: string;
  issuer: string;
  audience: string;
}>;

type JwtVerifyOptions = Readonly<{
  algorithms: readonly ["HS256"];
  issuer: string;
  audience: string;
}>;

export type VerifiedTokenPayload = Readonly<
  Record<string, unknown> & {
    sub?: string;
    iat?: number;
    exp?: number;
    iss?: string;
    aud?: string | string[];
  }
>;

const ACCESS_OPTIONS: JwtSignOptions = {
  algorithm: "HS256",
  expiresIn: JWT.EXPIRES_IN,
  issuer: JWT.ISSUER,
  audience: JWT.AUDIENCE,
};

const REFRESH_OPTIONS: JwtSignOptions = {
  algorithm: "HS256",
  expiresIn: JWT.REFRESH_EXPIRES_IN,
  issuer: JWT.ISSUER,
  audience: `${JWT.AUDIENCE}:refresh`,
};

const ACCESS_VERIFY_OPTIONS: JwtVerifyOptions = {
  algorithms: ["HS256"],
  issuer: JWT.ISSUER,
  audience: JWT.AUDIENCE,
};

const REFRESH_VERIFY_OPTIONS: JwtVerifyOptions = {
  algorithms: ["HS256"],
  issuer: JWT.ISSUER,
  audience: `${JWT.AUDIENCE}:refresh`,
};

function asVerifiedPayload(value: unknown): VerifiedTokenPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("JWT payload must be an object.");
  }
  return value as VerifiedTokenPayload;
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const generateEmailToken = generateOpaqueToken;

export const generateCancelToken = (): string => crypto.randomUUID();

export function signAccessToken(payload: object): string {
  return jwt.sign(payload, JWT.SECRET, ACCESS_OPTIONS);
}

export function verifyAccessToken(token: string): VerifiedTokenPayload {
  return asVerifiedPayload(jwt.verify(token, JWT.SECRET, ACCESS_VERIFY_OPTIONS));
}

/** Retained only for compatibility with non-browser integrations. */
export function signRefreshToken(payload: object): string {
  return jwt.sign(payload, JWT.REFRESH_SECRET, REFRESH_OPTIONS);
}

export function verifyRefreshToken(token: string): VerifiedTokenPayload {
  return asVerifiedPayload(
    jwt.verify(token, JWT.REFRESH_SECRET, REFRESH_VERIFY_OPTIONS),
  );
}

export function generateTokens(payload: object) {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export default {
  generateOpaqueToken,
  hashOpaqueToken,
  generateEmailToken,
  generateCancelToken,
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateTokens,
};
