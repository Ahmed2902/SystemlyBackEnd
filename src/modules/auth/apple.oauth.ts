import type { NextFunction, Request, Response } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import appleSignin from "apple-signin-auth";
import * as authService from "./auth.service";
import { ok, fail } from "../../shared/utils/response.util";

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

const REFRESH_COOKIE_NAME = "refreshToken";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/* -------------------------
   GENERATE APPLE CLIENT SECRET
-------------------------- */
function generateClientSecret() {
  const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );

  const teamId = process.env.APPLE_TEAM_ID!;
  const clientId = process.env.APPLE_CLIENT_ID!;
  const keyId = process.env.APPLE_KEY_ID!;

  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iss: teamId,
      iat: now,
      exp: now + 15777000, // ~6 months
      aud: "https://appleid.apple.com",
      sub: clientId,
    },
    privateKey,
    {
      algorithm: "ES256",
      keyid: keyId,
    }
  );
}

/* -------------------------
   REDIRECT TO APPLE
-------------------------- */
export const appleRedirect = (_req: Request, res: Response) => {
  const clientId = process.env.APPLE_CLIENT_ID!;
  const redirectUri = process.env.APPLE_REDIRECT_URI!;

  const url =
    `https://appleid.apple.com/auth/authorize?` +
    `response_type=code&` +
    `response_mode=form_post&` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=name%20email`;

  return res.redirect(url);
};

/* -------------------------
   APPLE CALLBACK (SECURE)
-------------------------- */
export const appleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const code = req.body?.code || req.query?.code;

    if (!code) {
      return fail(res, "Missing authorization code", 400, "MISSING_CODE");
    }

    /* -------------------------
       EXCHANGE CODE FOR TOKEN
    -------------------------- */
    const clientSecret = generateClientSecret();

    const tokenRes = await axios.post(
      APPLE_TOKEN_URL,
      new URLSearchParams({
        client_id: process.env.APPLE_CLIENT_ID!,
        client_secret: clientSecret,
        code: String(code),
        grant_type: "authorization_code",
        redirect_uri: process.env.APPLE_REDIRECT_URI!,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const idToken = tokenRes.data?.id_token;

    if (!idToken) {
      return fail(res, "No id_token returned", 400, "NO_ID_TOKEN");
    }

    /* -------------------------
       VERIFY APPLE TOKEN (REAL SECURITY)
    -------------------------- */
    const payload = await appleSignin.verifyIdToken(idToken, {
      audience: process.env.APPLE_CLIENT_ID!,
      ignoreExpiration: false,
    });

    if (!payload || !payload.sub) {
      return fail(res, "Invalid Apple token", 400, "INVALID_TOKEN");
    }

    const email = payload.email;

    if (!email) {
      return fail(
        res,
        "Apple did not return email (first login only)",
        400,
        "NO_EMAIL"
      );
    }

    /* -------------------------
       AUTH SERVICE
    -------------------------- */
    const result = await authService.oauthSignIn({
      provider: "apple",
      providerId: payload.sub,
      email,
      name: null,
      picture: null,
      emailVerified: true,
      // YOU SAID passwordHash required → handled inside service as ""
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
