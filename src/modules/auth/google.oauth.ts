import type { NextFunction, Request, Response } from "express";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import * as authService from "./auth.service";
import { ok, fail } from "../../shared/utils/response.util";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const REFRESH_COOKIE_NAME = "refreshToken";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/* -------------------------
   REDIRECT TO GOOGLE
-------------------------- */
export const googleRedirect = (_req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "";
  const scope = "openid email profile";

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=offline&` +
    `prompt=consent`;

  return res.redirect(url);
};

/* -------------------------
   GOOGLE CALLBACK (SECURE)
-------------------------- */
export const googleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const code = req.query?.code ? String(req.query.code) : null;

    if (!code) {
      return fail(res, "Missing authorization code", 400, "MISSING_CODE");
    }

    /* -------------------------
       EXCHANGE CODE FOR TOKENS
    -------------------------- */
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
        grant_type: "authorization_code",
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const idToken = tokenRes.data?.id_token;

    if (!idToken) {
      return fail(res, "No id_token returned", 400, "NO_ID_TOKEN");
    }

    /* -------------------------
       VERIFY TOKEN (IMPORTANT FIX)
    -------------------------- */
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return fail(res, "Invalid Google token", 400, "INVALID_TOKEN");
    }

    /* -------------------------
       EXTRACT USER DATA SAFELY
    -------------------------- */
    const result = await authService.oauthSignIn({
      provider: "google",
      providerId: payload.sub,
      email: payload.email,
      name: payload.name || null,
      picture: payload.picture || null,
      emailVerified: !!payload.email_verified,
    });

    /* -------------------------
       SET AUTH COOKIE
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

export default { googleRedirect, googleCallback };
