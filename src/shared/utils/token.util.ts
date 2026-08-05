import crypto from "node:crypto";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { JWT } from "../config/config";

const ACCESS_OPTIONS: SignOptions = {
  algorithm: "HS256",
  expiresIn: JWT.EXPIRES_IN as SignOptions["expiresIn"],
  issuer: JWT.ISSUER,
  audience: JWT.AUDIENCE,
};

const REFRESH_OPTIONS: SignOptions = {
  algorithm: "HS256",
  expiresIn: JWT.REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
  issuer: JWT.ISSUER,
  audience: `${JWT.AUDIENCE}:refresh`,
};

export const generateEmailToken = (): string =>
  crypto.randomBytes(32).toString("hex");

export const generateCancelToken = (): string => uuidv4();

export function signAccessToken(payload: object): string {
  return jwt.sign(payload, JWT.SECRET, ACCESS_OPTIONS);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT.SECRET, {
    algorithms: ["HS256"],
    issuer: JWT.ISSUER,
    audience: JWT.AUDIENCE,
  }) as JwtPayload;
}

/** Retained only for compatibility with non-browser integrations. */
export function signRefreshToken(payload: object): string {
  return jwt.sign(payload, JWT.REFRESH_SECRET, REFRESH_OPTIONS);
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, JWT.REFRESH_SECRET, {
    algorithms: ["HS256"],
    issuer: JWT.ISSUER,
    audience: `${JWT.AUDIENCE}:refresh`,
  }) as JwtPayload;
}

export function generateTokens(payload: object) {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export default {
  generateEmailToken,
  generateCancelToken,
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateTokens,
};
