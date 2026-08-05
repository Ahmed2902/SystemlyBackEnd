import { Roles } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma";
import { fail } from "../utils/response.util";
import { verifyAccessToken } from "../utils/token.util";

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

    const payload = verifyAccessToken(token) as Record<string, unknown>;
    const userId = payload.userId ?? payload.sub ?? payload.id;
    if (!userId) {
      return fail(
        res,
        "Invalid token",
        401,
        "UNAUTHORIZED",
        req.requestId ?? null,
      );
    }

    req.user = {
      id: String(userId),
      businessId: payload.businessId
        ? String(payload.businessId)
        : undefined,
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
    if (req.user.role === Roles.SuperAdmin.toString()) return next();
    if (allowed.includes(req.user.role || "")) return next();
    return fail(res, "Forbidden", 403, "FORBIDDEN", req.requestId ?? null);
  };
};

export const requireBusinessAccess = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    return fail(res, "Unauthorized", 401, "UNAUTHORIZED", req.requestId ?? null);
  }
  if (req.user.role === Roles.SuperAdmin.toString()) return next();

  const businessId =
    (req.params && (req.params as Record<string, unknown>).businessId) ||
    (req.body && (req.body as Record<string, unknown>).businessId) ||
    (req.query && (req.query as Record<string, unknown>).businessId) ||
    req.user.businessId;
  if (!businessId) {
    return fail(
      res,
      "Business id missing",
      400,
      "BAD_REQUEST",
      req.requestId ?? null,
    );
  }
  if (String(businessId) !== String(req.user.businessId)) {
    return fail(res, "Forbidden", 403, "FORBIDDEN", req.requestId ?? null);
  }
  return next();
};

export const requireAppointmentOwnerOrAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401, "UNAUTHORIZED", req.requestId ?? null);
    }
    if (!req.user.businessId) {
      return fail(
        res,
        "Business id missing",
        400,
        "BAD_REQUEST",
        req.requestId ?? null,
      );
    }
    const appointmentId = req.params.appointmentId;
    if (!appointmentId) {
      return fail(
        res,
        "Appointment id missing",
        400,
        "BAD_REQUEST",
        req.requestId ?? null,
      );
    }
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      return fail(
        res,
        "Appointment not found",
        404,
        "NOT_FOUND",
        req.requestId ?? null,
      );
    }
    if (req.user.role === Roles.SuperAdmin.toString()) return next();
    if (
      [Roles.BusinessAdmin.toString(), Roles.Receptionist.toString()].includes(
        req.user.role || "",
      ) &&
      appointment.businessId === req.user.businessId
    ) {
      return next();
    }
    if (
      req.user.role === Roles.Staff.toString() &&
      appointment.staffId === req.user.id
    ) {
      return next();
    }
    return fail(res, "Forbidden", 403, "FORBIDDEN", req.requestId ?? null);
  } catch (error) {
    return next(error);
  }
};

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
      "Business id missing",
      400,
      "BAD_REQUEST",
      req.requestId ?? null,
    );
  }
  return next();
};

export default {
  requireAuth,
  requireRole,
  requireBusinessAccess,
  requireAppointmentOwnerOrAdmin,
  requireBusinessId,
};
