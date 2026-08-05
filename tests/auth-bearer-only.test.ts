jest.mock("../src/shared/utils/token.util", () => ({
  verifyAccessToken: jest.fn(),
}));

import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../src/shared/middleware/auth.middleware";
import { verifyAccessToken } from "../src/shared/utils/token.util";

function responseDouble() {
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  return response as unknown as Response;
}

describe("requireAuth bearer boundary", () => {
  test("does not authenticate an accessToken cookie", () => {
    const response = responseDouble();
    const next = jest.fn() as NextFunction;

    requireAuth(
      {
        headers: {},
        cookies: { accessToken: "cookie-token" },
      } as Request,
      response,
      next,
    );

    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });

  test("authenticates a bearer token", () => {
    (verifyAccessToken as jest.Mock).mockReturnValue({
      userId: "user-1",
      businessId: "business-1",
      role: "BusinessAdmin",
    });
    const response = responseDouble();
    const next = jest.fn() as NextFunction;
    const request = {
      headers: { authorization: "Bearer valid-token" },
    } as Request;

    requireAuth(request, response, next);

    expect(verifyAccessToken).toHaveBeenCalledWith("valid-token");
    expect(request.user).toEqual(
      expect.objectContaining({ id: "user-1", businessId: "business-1" }),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
