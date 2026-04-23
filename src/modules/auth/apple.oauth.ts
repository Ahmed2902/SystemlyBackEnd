import type { NextFunction, Request, Response } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import appleSignin from "apple-signin-auth";
import crypto from "crypto";
import * as authService from "./auth.service";
import { ok, fail } from "../../shared/utils/response.util";

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

const REFRESH_COOKIE_NAME = "refreshToken";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/* -------------------------
   GENERATE CLIENT SECRET
-------------------------- */
function generateClientSecret() {
  const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: process.env.APPLE_TEAM_ID!,
      iat: now,
      exp: now + 15777000,
      aud: "https://appleid.apple.com",
      sub: process.env.APPLE_CLIENT_ID!,
    },
    privateKey,
    {
      algorithm: "ES256",
      keyid: process.env.APPLE_KEY_ID!,
    }
  );
}

/* -------------------------
   REDIRECT
-------------------------- */
export const appleRedirect = (_req: Request, res: Response) => {
  const state = crypto.randomBytes(32).toString("hex");

  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const url =
    `https://appleid.apple.com/auth/authorize?` +
    `response_type=code&` +
    `response_mode=form_post&` +
    `client_id=${encodeURIComponent(process.env.APPLE_CLIENT_ID!)}&` +
    `redirect_uri=${encodeURIComponent(process.env.APPLE_REDIRECT_URI!)}&` +
    `scope=name%20email&` +
    `state=${state}`;

  return res.redirect(url);
};

/* -------------------------
   CALLBACK
-------------------------- */
export const appleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (req.body?.error || req.query?.error) {
      return fail(res, "OAuth error", 400, "OAUTH_ERROR");
    }

    const code = req.body?.code || req.query?.code;
    if (!code) {
      return fail(res, "Missing authorization code", 400, "MISSING_CODE");
    }

    /* -------------------------
       STATE CHECK
    -------------------------- */
    const state = req.body?.state || req.query?.state;
    const storedState = req.cookies.oauth_state;

    if (!state || state !== storedState) {
      return fail(res, "Invalid state", 400, "INVALID_STATE");
    }

    res.clearCookie("oauth_state");

    /* -------------------------
       EXCHANGE TOKEN
    -------------------------- */
    const tokenRes = await axios.post(
      APPLE_TOKEN_URL,
      new URLSearchParams({
        client_id: process.env.APPLE_CLIENT_ID!,
        client_secret: generateClientSecret(),
        code: String(code),
        grant_type: "authorization_code",
        redirect_uri: process.env.APPLE_REDIRECT_URI!,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 5000,
      }
    );

    const idToken = tokenRes.data?.id_token;
    if (!idToken) {
      return fail(res, "No id_token", 400, "NO_ID_TOKEN");
    }

    /* -------------------------
       VERIFY TOKEN
    -------------------------- */
    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: process.env.APPLE_CLIENT_ID!,
    });

    if (!payload || !payload.sub) {
      return fail(res, "Invalid token", 400, "INVALID_TOKEN");
    }

    /* -------------------------
       HANDLE EMAIL PROPERLY
    -------------------------- */
    let email = payload.email || null;

    // Apple sends user info ONLY first time
    if (!email && req.body?.user) {
      try {
        const parsed = JSON.parse(req.body.user);
        email = parsed?.email || null;
      } catch {
        // ignore
      }
    }

    /* -------------------------
       SIGN IN LOGIC (FIXED)
    -------------------------- */
    const result = await authService.oauthSignIn({
      provider: "apple",
      providerId: payload.sub,
      email: email, // may be null
      name: null,
      picture: null,
      emailVerified: true,
    });

    /* -------------------------
       COOKIE
    -------------------------- */
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS
    );

    return ok(res, {
      accessToken: result.accessToken,
      user: result.user,
    });
  } catch (err) {
    return next(err);
  }
};

export default { appleRedirect, appleCallback };
