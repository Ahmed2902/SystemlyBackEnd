jest.mock("axios", () => ({ post: jest.fn() }));
jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import type { NextFunction, Request, Response } from "express";
import authController from "../src/modules/auth/auth.controller";
import authService from "../src/modules/auth/auth.service";
import {
  googleCallback,
  googleRedirect,
} from "../src/modules/auth/google.oauth";
import { Errors } from "../src/shared/errors/application-error";

const mockedAxiosPost = axios.post as jest.MockedFunction<typeof axios.post>;
const mockedOauthConstructor = OAuth2Client as unknown as jest.Mock;

function responseDouble() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.redirect.mockReturnValue(response);
  return response as unknown as Response;
}

function cookieValue(res: Response, name: string): string {
  const call = (res.cookie as jest.Mock).mock.calls.find(
    ([cookieName]) => cookieName === name,
  );
  if (!call) throw new Error(`Cookie ${name} was not set`);
  return call[1] as string;
}

describe("auth production hardening", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockedAxiosPost.mockReset();
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_REDIRECT_URI =
      "https://api.systemly.test/api/auth/oauth/google/callback";
    process.env.APP_URL = "https://api.systemly.test";
    process.env.FRONTEND_URL = "https://app.systemly.test";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  test("failed refresh never clears a possibly newer browser refresh cookie", async () => {
    jest
      .spyOn(authService, "refreshToken")
      .mockRejectedValueOnce(
        Errors.unauthorized("Invalid refresh token", "INVALID_REFRESH_TOKEN"),
      );

    const req = {
      cookies: { refreshToken: "old-refresh-token" },
      requestId: "refresh-race-test",
    } as unknown as Request;
    const res = responseDouble();
    const next = jest.fn() as unknown as NextFunction;

    await authController.refresh(req, res, next);

    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("Google redirect binds state to an HttpOnly cookie and uses PKCE S256", () => {
    const res = responseDouble();

    googleRedirect({} as Request, res);

    const state = cookieValue(res, "oauth_state");
    const verifier = cookieValue(res, "oauth_pkce_verifier");
    const redirectUrl = (res.redirect as jest.Mock).mock.calls[0][0] as string;
    const parsed = new URL(redirectUrl);

    expect(state.length).toBeGreaterThan(20);
    expect(verifier.length).toBeGreaterThan(40);
    expect(parsed.searchParams.get("state")).toBe(state);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("code_challenge")).toBeTruthy();
    expect(parsed.searchParams.get("code_challenge")).not.toBe(verifier);
    expect(parsed.searchParams.has("token")).toBe(false);

    for (const cookieName of ["oauth_state", "oauth_pkce_verifier"]) {
      const call = (res.cookie as jest.Mock).mock.calls.find(
        ([name]) => name === cookieName,
      );
      expect(call?.[2]).toEqual(
        expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
      );
    }
  });

  test("production Google redirect derives callback from APP_URL instead of a stale localhost override", () => {
    process.env.NODE_ENV = "production";
    process.env.APP_URL = "https://api.systemly.test";
    process.env.GOOGLE_REDIRECT_URI =
      "http://localhost:3003/api/auth/oauth/google/callback";
    const res = responseDouble();

    googleRedirect({} as Request, res);

    const redirectUrl = (res.redirect as jest.Mock).mock.calls[0][0] as string;
    const parsed = new URL(redirectUrl);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://api.systemly.test/api/auth/oauth/google/callback",
    );
  });

  test("Google callback rejects state that is not bound to the browser", async () => {
    const req = {
      query: { code: "google-code", state: "attacker-state" },
      cookies: {
        oauth_state: "browser-state",
        oauth_pkce_verifier: "browser-verifier",
      },
    } as unknown as Request;
    const res = responseDouble();
    const next = jest.fn() as unknown as NextFunction;

    await googleCallback(req, res, next);

    expect(mockedAxiosPost).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.clearCookie).toHaveBeenCalledWith("oauth_state", { path: "/" });
    expect(next).not.toHaveBeenCalled();
  });

  test("Google callback exchanges PKCE code, sets only refresh session and redirects without tokens", async () => {
    const redirectRes = responseDouble();
    googleRedirect({} as Request, redirectRes);
    const state = cookieValue(redirectRes, "oauth_state");
    const verifier = cookieValue(redirectRes, "oauth_pkce_verifier");

    mockedAxiosPost.mockResolvedValueOnce({
      data: { id_token: "google-id-token" },
    } as never);

    const oauthClient = mockedOauthConstructor.mock.results[0]
      ?.value as { verifyIdToken: jest.Mock };
    oauthClient.verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({
        sub: "google-user-1",
        email: "oauth@example.com",
        email_verified: true,
        name: "OAuth User",
      }),
    });

    jest.spyOn(authService, "oauthSignIn").mockResolvedValueOnce({
      accessToken: "server-access-token-that-must-not-leak",
      refreshToken: "server-refresh-token",
      user: {
        id: "user-1",
        name: "OAuth User",
        email: "oauth@example.com",
      },
    } as never);

    const req = {
      query: { code: "google-code", state },
      cookies: {
        oauth_state: state,
        oauth_pkce_verifier: verifier,
      },
    } as unknown as Request;
    const res = responseDouble();
    const next = jest.fn() as unknown as NextFunction;

    await googleCallback(req, res, next);

    const tokenRequestBody = mockedAxiosPost.mock.calls[0][1] as string;
    const tokenParams = new URLSearchParams(tokenRequestBody);
    expect(tokenParams.get("code_verifier")).toBe(verifier);

    expect(res.cookie).toHaveBeenCalledWith(
      "refreshToken",
      "server-refresh-token",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.cookie).not.toHaveBeenCalledWith(
      "accessToken",
      expect.anything(),
      expect.anything(),
    );

    const redirectUrl = (res.redirect as jest.Mock).mock.calls[0][0] as string;
    expect(redirectUrl).toBe("https://app.systemly.test/oauth-callback");
    expect(redirectUrl).not.toContain("server-access-token-that-must-not-leak");
    expect(next).not.toHaveBeenCalled();
  });
});
