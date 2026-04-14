import type { NextFunction, Request, Response } from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import * as authService from "./auth.service";
import { ok, fail } from "../../shared/utils/response.util";

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

function generateClientSecret() {
  const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n"
  );
  const teamId = process.env.APPLE_TEAM_ID || "";
  const clientId = process.env.APPLE_CLIENT_ID || "";
  const keyId = process.env.APPLE_KEY_ID || "";
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: teamId,
    iat: now,
    exp: now + 15777000,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };
  return jwt.sign(claims as any, privateKey, {
    algorithm: "ES256",
    keyid: keyId,
  });
}

export const appleRedirect = (_req: Request, res: Response) => {
  const clientId = process.env.APPLE_CLIENT_ID || "";
  const redirectUri = process.env.APPLE_REDIRECT_URI || "";
  const scope = "name email";
  const url = `https://appleid.apple.com/auth/authorize?response_type=code%20id_token&response_mode=form_post&client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
    scope
  )}`;
  return res.redirect(url);
};

export const appleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Apple typically POSTs form data (response_mode=form_post) but accept query as well
    const code = req.body?.code || req.query?.code;
    const id_token = req.body?.id_token || req.query?.id_token;
    if (!code && !id_token)
      return fail(res, "Missing code or id_token", 400, "MISSING_CODE");

    let decoded: any = null;
    if (id_token) {
      decoded = jwt.decode(String(id_token));
    } else {
      const clientSecret = generateClientSecret();
      const tokenRes = await axios.post(
        APPLE_TOKEN_URL,
        new URLSearchParams({
          client_id: process.env.APPLE_CLIENT_ID || "",
          client_secret: clientSecret,
          code: String(code),
          grant_type: "authorization_code",
          redirect_uri: process.env.APPLE_REDIRECT_URI || "",
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      decoded = jwt.decode(tokenRes.data?.id_token);
    }

    if (!decoded || !decoded.sub)
      return fail(res, "Invalid id_token", 400, "INVALID_TOKEN");
    const email = decoded.email;
    if (!email)
      return fail(
        res,
        "Apple did not provide email. Ask client to provide email.",
        400,
        "NO_EMAIL"
      );

    const result = await authService.oauthSignIn({
      provider: "apple",
      providerId: decoded.sub,
      email,
      name: decoded.name || null,
      picture: null,
      emailVerified: !!decoded.email_verified,
    });

    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      REFRESH_COOKIE_OPTIONS
    );
    return ok(res, { accessToken: result.accessToken, user: result.user });
  } catch (err) {
    return next(err);
  }
};

export default { appleRedirect, appleCallback };
