import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import authService from "./auth.service";
import { fail } from "../../shared/utils/response.util";
import { AUTH_CONSTANTS } from "../../shared/config/config";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const REFRESH_COOKIE_NAME = "refreshToken";
const OAUTH_STATE_COOKIE_NAME = "oauth_state";
const OAUTH_VERIFIER_COOKIE_NAME = "oauth_pkce_verifier";
const OAUTH_TTL_MS = 10 * 60 * 1000;

const oauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: OAUTH_TTL_MS,
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "none" as const,
  maxAge: AUTH_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS * 1000,
  path: "/",
};

function getGoogleRedirectUri() {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");

  // Production has one canonical backend origin. Deriving the callback from it
  // prevents a stale GOOGLE_REDIRECT_URI from sending users back to localhost.
  if (process.env.NODE_ENV === "production") {
    if (!appUrl) throw new Error("APP_URL is required for Google OAuth in production");
    return `${appUrl}/api/auth/oauth/google/callback`;
  }

  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return `${appUrl || "http://localhost:3000"}/api/auth/oauth/google/callback`;
}

function getRequiredGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }
  return { clientId, clientSecret, redirectUri: getGoogleRedirectUri() };
}

function randomBase64Url(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function sameSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function clearOauthCookies(res: Response) {
  res.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: "/" });
  res.clearCookie(OAUTH_VERIFIER_COOKIE_NAME, { path: "/" });
}

export const googleRedirect = (_req: Request, res: Response) => {
  const { clientId, redirectUri } = getRequiredGoogleConfig();
  const state = randomBase64Url();
  const verifier = randomBase64Url(48);

  res.cookie(OAUTH_STATE_COOKIE_NAME, state, oauthCookieOptions);
  res.cookie(OAUTH_VERIFIER_COOKIE_NAME, verifier, oauthCookieOptions);

  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
};

export const googleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (req.query.error) {
      clearOauthCookies(res);
      return fail(res, "OAuth error", 400, "OAUTH_ERROR");
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const returnedState =
      typeof req.query.state === "string" ? req.query.state : "";
    const storedState = req.cookies?.[OAUTH_STATE_COOKIE_NAME];
    const verifier = req.cookies?.[OAUTH_VERIFIER_COOKIE_NAME];

    if (!code) {
      clearOauthCookies(res);
      return fail(res, "Missing authorization code", 400, "MISSING_CODE");
    }

    if (
      typeof storedState !== "string" ||
      typeof verifier !== "string" ||
      !returnedState ||
      !sameSecret(returnedState, storedState)
    ) {
      clearOauthCookies(res);
      return fail(res, "Invalid OAuth state", 400, "INVALID_STATE");
    }

    clearOauthCookies(res);

    const { clientId, clientSecret, redirectUri } = getRequiredGoogleConfig();
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 5_000,
      },
    );

    const idToken = tokenRes.data?.id_token;
    if (!idToken) {
      return fail(res, "No id_token returned", 400, "NO_ID_TOKEN");
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      return fail(res, "Invalid Google token", 400, "INVALID_TOKEN");
    }

    const result = await authService.oauthSignIn({
      provider: "google",
      providerId: payload.sub,
      email: payload.email,
      name: payload.name || null,
      picture: payload.picture || null,
      emailVerified: Boolean(payload.email_verified),
    });

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions);
    return res.redirect(`${process.env.FRONTEND_URL}/oauth-callback`);
  } catch (error) {
    clearOauthCookies(res);
    return next(error);
  }
};

export default { googleRedirect, googleCallback };
