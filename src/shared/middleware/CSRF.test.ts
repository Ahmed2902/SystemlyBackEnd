jest.mock("../config/config", () => ({
  APP_CONFIG: {
    isProduction: false,
    corsOrigins: ["https://app.systemly.test"],
  },
}));

import type { NextFunction, Request, Response } from "express";
import {
  createCsrfToken,
  csrfProtection,
  issueCsrfToken,
  verifyCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from "./CSRF";

function responseDouble() {
  const response = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    set: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response as unknown as Response;
}

function requestDouble(input: {
  origin?: string;
  token?: string;
  cookieToken?: string;
}) {
  return {
    cookies: input.cookieToken
      ? { [CSRF_COOKIE_NAME]: input.cookieToken }
      : {},
    get: jest.fn((name: string) => {
      if (name.toLowerCase() === "origin") return input.origin;
      if (name.toLowerCase() === CSRF_HEADER_NAME) return input.token;
      return undefined;
    }),
  } as unknown as Request;
}

describe("signed double-submit CSRF protection", () => {
  test("creates verifiable expiring tokens", () => {
    const now = Date.now();
    const token = createCsrfToken(now);

    expect(verifyCsrfToken(token, now + 1_000)).toBe(true);
    expect(verifyCsrfToken(`${token}tampered`, now + 1_000)).toBe(false);
    expect(verifyCsrfToken(token, now + 3 * 60 * 60 * 1_000)).toBe(false);
  });

  test("issues the same signed token in the cookie and response", () => {
    const response = responseDouble();
    issueCsrfToken({} as Request, response);

    const token = (response.cookie as jest.Mock).mock.calls[0][1];
    expect(verifyCsrfToken(token)).toBe(true);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { csrfToken: token },
    });
  });

  test("accepts the allowed origin with matching valid tokens", () => {
    const token = createCsrfToken();
    const next = jest.fn() as NextFunction;

    csrfProtection(
      requestDouble({
        origin: "https://app.systemly.test",
        token,
        cookieToken: token,
      }),
      responseDouble(),
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  test("rejects unapproved origins before cookie validation", () => {
    const token = createCsrfToken();
    const next = jest.fn() as NextFunction;

    csrfProtection(
      requestDouble({
        origin: "https://attacker.example",
        token,
        cookieToken: token,
      }),
      responseDouble(),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CSRF_ORIGIN_DENIED", statusCode: 403 }),
    );
  });

  test("rejects missing or mismatched tokens", () => {
    const next = jest.fn() as NextFunction;

    csrfProtection(
      requestDouble({ origin: "https://app.systemly.test" }),
      responseDouble(),
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CSRF_INVALID", statusCode: 403 }),
    );
  });
});
