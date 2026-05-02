import type { NextFunction, Request, Response } from "express";
import axios from "axios";
import type { AxiosError } from "axios";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import * as authService from "./auth.service";
import { ok, fail } from "../../shared/utils/response.util";
import { FRONTEND_URL } from "../../shared/config/config";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const REFRESH_COOKIE_NAME = "refreshToken";
const OAUTH_STATE_COOKIE_NAME = "oauth_state";

// Stateless HMAC-signed state (works across multiple instances / serverless)
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const STATE_SECRET =
  process.env.OAUTH_STATE_SECRET || process.env.APP_SECRET || "";

if (!STATE_SECRET) {
  console.warn(
    "OAUTH_STATE_SECRET not set — set process.env.OAUTH_STATE_SECRET for secure stateless state verification"
  );
}

const createState = () => {
  const nonce = crypto.randomBytes(16).toString("hex");
  const expiry = Date.now() + STATE_TTL_MS;
  const data = `${nonce}.${expiry}`;
  const sig = crypto
    .createHmac("sha256", STATE_SECRET)
    .update(data)
    .digest("hex");
  const state = `${nonce}.${expiry}.${sig}`;
  return encodeURIComponent(state);
};

const verifyState = (encodedState: string) => {
  try {
    const state = decodeURIComponent(encodedState);
    const parts = state.split(".");
    if (parts.length !== 3) return false;
    const [nonce, expiryStr, sig] = parts;
    const data = `${nonce}.${expiryStr}`;
    const expected = crypto
      .createHmac("sha256", STATE_SECRET)
      .update(data)
      .digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const sigBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length !== sigBuf.length) return false;
    if (!crypto.timingSafeEqual(expectedBuf, sigBuf)) return false;
    if (Date.now() > Number(expiryStr)) return false;
    return true;
  } catch (err) {
    return false;
  }
};

const getIsHttpsRequest = (req: Request) => {
  if (req.secure) return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (typeof forwardedProto === "string")
    return forwardedProto.includes("https");
  if (Array.isArray(forwardedProto))
    return forwardedProto.some((p) => p.includes("https"));
  return false;
};

const isBrowserNavigation = (req: Request) => {
  const accept =
    typeof req.headers.accept === "string" ? req.headers.accept : "";
  const fetchMode =
    typeof req.headers["sec-fetch-mode"] === "string"
      ? req.headers["sec-fetch-mode"]
      : "";
  return fetchMode === "navigate" || accept.includes("text/html");
};

const getOauthStateCookieOptions = (req: Request) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: getIsHttpsRequest(req),
  path: "/",
  maxAge: STATE_TTL_MS,
});

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "none" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

const getBaseUrlFromRequest = (req: Request) => {
  const protoHeader = req.headers["x-forwarded-proto"];
  const hostHeader = req.headers["x-forwarded-host"] || req.headers["host"];

  const proto =
    typeof protoHeader === "string"
      ? protoHeader.split(",")[0].trim()
      : getIsHttpsRequest(req)
      ? "https"
      : "http";

  const host =
    typeof hostHeader === "string"
      ? hostHeader.split(",")[0].trim()
      : Array.isArray(hostHeader)
      ? hostHeader[0]
      : undefined;

  if (!host) return null;
  return `${proto}://${host}`;
};

const getGoogleRedirectUri = (req: Request) => {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const baseUrl =
    getBaseUrlFromRequest(req) ||
    process.env.APP_URL ||
    "http://localhost:3000";
  return `${String(baseUrl).replace(/\/$/, "")}/api/auth/oauth/google/callback`;
};

const frontendSignupError = (err: string) =>
  `${FRONTEND_URL.replace(/\/$/, "")}/signup?oauthError=${encodeURIComponent(
    err
  )}`;

const frontendSignupErrorWithDebug = (
  err: string,
  debug: Record<string, string | number | boolean | null | undefined>
) => {
  const base = frontendSignupError(err);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(debug)) {
    if (v === undefined) continue;
    qs.set(k, String(v));
  }
  const extra = qs.toString();
  return extra ? `${base}&${extra}` : base;
};

/* -------------------------
   REDIRECT TO GOOGLE
-------------------------- */
export const googleRedirect = (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  if (!clientId) {
    return res.redirect(
      frontendSignupErrorWithDebug("start_failed", {
        hasGoogleClientId: false,
        env: process.env.NODE_ENV || "development",
      })
    );
  }

  const state = createState();
  const redirectUri = getGoogleRedirectUri(req);

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent("openid email profile")}&` +
    `access_type=offline&` +
    `prompt=consent&` +
    `state=${state}`;

  // Support clients that call this endpoint via fetch/XHR
  const acceptsJson =
    typeof req.headers.accept === "string" &&
    req.headers.accept.includes("application/json");
  const isFetch = typeof req.headers["sec-fetch-mode"] === "string";

  if (!isBrowserNavigation(req) && (acceptsJson || isFetch)) {
    return ok(res, { url });
  }

  return res.redirect(url);
};

/* -------------------------
   GOOGLE CALLBACK
-------------------------- */
export const googleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.query.error) {
      if (isBrowserNavigation(req))
        return res.redirect(frontendSignupError("oauth_error"));
      return fail(res, "OAuth error", 400, "OAUTH_ERROR");
    }

    const code = req.query?.code ? String(req.query.code) : null;
    if (!code) {
      if (isBrowserNavigation(req))
        return res.redirect(frontendSignupError("missing_code"));
      return fail(res, "Missing authorization code", 400, "MISSING_CODE");
    }

    const stateFromGoogle = req.query.state ? String(req.query.state) : null;

    if (!stateFromGoogle || !verifyState(stateFromGoogle)) {
      if (isBrowserNavigation(req))
        return res.redirect(frontendSignupError("invalid_state"));
      return fail(res, "Invalid state (CSRF DETECTED)", 400, "INVALID_STATE");
    }

    const redirectUri = getGoogleRedirectUri(req);

    let tokenRes: { data: any };
    try {
      tokenRes = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID || "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 5000,
        }
      );
    } catch (e) {
      const err = e as AxiosError<any>;
      if (isBrowserNavigation(req))
        return res.redirect(frontendSignupError("token_exchange_failed"));

      return res.status(400).json({
        success: false,
        error: "Google token exchange failed",
        code: "GOOGLE_TOKEN_EXCHANGE_FAILED",
        details: {
          status: err.response?.status ?? null,
          googleError: err.response?.data ?? null,
          redirectUri,
        },
      });
    }

    const idToken = tokenRes.data?.id_token;
    if (!idToken) {
      if (isBrowserNavigation(req))
        return res.redirect(frontendSignupError("no_id_token"));
      return fail(res, "No id_token returned", 400, "NO_ID_TOKEN");
    }

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      if (isBrowserNavigation(req))
        return res.redirect(frontendSignupError("invalid_token"));
      return fail(res, "Invalid Google token", 400, "INVALID_TOKEN");
    }

    const result = await authService.oauthSignIn({
      provider: "google",
      providerId: payload.sub,
      email: payload.email,
      name: payload.name || null,
      picture: payload.picture || null,
      emailVerified: !!payload.email_verified,
    });

    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS
    );

    if (isBrowserNavigation(req)) {
      return res.redirect(
        `${FRONTEND_URL.replace(/\/$/, "")}/signup?oauthSuccess=1`
      );
    }

    return ok(res, {
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    return next(err);
  }
};

export default { googleRedirect, googleCallback };
