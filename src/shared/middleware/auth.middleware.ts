import { Roles } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { fail } from "../utils/response.util";
import { verifyAccessToken } from "../utils/token.util";

function singleParameter(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authorization = req.headers.authorization;
    const token =
      typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length).trim()
        : "";

    if (!token) {
      return fail(
        res,
        "Missing or invalid authentication",
        401,
        "UNAUTHORIZED",
        req.requestId ?? null,
      );
    }

    const payload = verifyAccessToken(token);
    const userId = payload.userId ?? payload.sub ?? payload.id;
    if (typeof userId !== "string" || !userId) {
      return fail(
        res,
        "Invalid token",
        401,
        "UNAUTHORIZED",
        req.requestId ?? null,
      );
    }

    req.user = {
      id: userId,
      businessId:
        typeof payload.businessId === "string" ? payload.businessId : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
    return next();
  } catch {
    return fail(
      res,
      "Invalid or expired token",
      401,
      "UNAUTHORIZED",
      req.requestId ?? null,
    );
  }
};

export const requireRole = (roles: string | string[]) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return fail(res, "Unauthorized", 401, "UNAUTHORIZED", req.requestId ?? null);
    }
    if (req.user.role === Roles.SuperAdmin) return next();
    if (allowed.includes(req.user.role || "")) return next();
    return fail(res, "Forbidden", 403, "FORBIDDEN", req.requestId ?? null);
  };
};

function checkBusinessAccess(
  req: Request,
  res: Response,
  next: NextFunction,
  routeParamName?: string,
) {
  if (!req.user) {
    return fail(res, "Unauthorized", 401, "UNAUTHORIZED", req.requestId ?? null);
  }
  if (req.user.role === Roles.SuperAdmin) return next();
  if (!req.user.businessId) {
    return fail(
      res,
      "Business context missing",
      403,
      "BUSINESS_CONTEXT_REQUIRED",
      req.requestId ?? null,
    );
  }

  const parameterName = routeParamName ?? "businessId";
  const routeBusinessId = singleParameter(req.params?.[parameterName]);
  if (routeBusinessId && routeBusinessId !== req.user.businessId) {
    return fail(res, "Forbidden", 403, "FORBIDDEN", req.requestId ?? null);
  }

  return next();
}

export const requireBusinessAccess: RequestHandler = (req, res, next) =>
  checkBusinessAccess(req, res, next);

export const requireBusinessAccessFor = (routeParamName: string): RequestHandler =>
  (req, res, next) => checkBusinessAccess(req, res, next, routeParamName);

export const requireBusinessId = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return fail(res, "Unauthorized", 401, "UNAUTHORIZED", req.requestId ?? null);
  }
  if (!req.user.businessId) {
    return fail(
      res,
      "Business context missing",
      403,
      "BUSINESS_CONTEXT_REQUIRED",
      req.requestId ?? null,
    );
  }
  return next();
};

export default {
  requireAuth,
  requireRole,
  requireBusinessAccess,
  requireBusinessAccessFor,
  requireBusinessId,
};
