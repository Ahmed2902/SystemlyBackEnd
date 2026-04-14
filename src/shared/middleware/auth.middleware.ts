import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/token.util";
import { prisma } from "../db/prisma";
import { fail } from "../utils/response.util";
import { Prisma, Roles } from "@prisma/client";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      businessId?: string;
      role?: string;
      email?: string;
    };
  }
}

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (
      !authHeader ||
      typeof authHeader !== "string" ||
      !authHeader.startsWith("Bearer ")
    ) {
      return fail(
        res,
        "Missing or invalid Authorization header",
        401,
        "UNAUTHORIZED"
      );
    }
    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token) as any;
    if (!payload) {
      return fail(res, "Invalid token", 401, "UNAUTHORIZED");
    }
    req.user = {
      id: String(payload.userId ?? payload.sub ?? payload.id),
      businessId: payload.businessId ? String(payload.businessId) : undefined,
      role: typeof payload.role === "string" ? payload.role : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
    return next();
  } catch (err) {
    return fail(res, "Invalid or expired token", 401, "UNAUTHORIZED");
  }
};

export const requireRole = (roles: string | string[]) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    }
    if (req.user.role === Roles.SuperAdmin.toString()) {
      return next();
    }
    if (allowed.includes(req.user.role || "")) {
      return next();
    }
    return fail(res, "Forbidden", 403, "FORBIDDEN");
  };
};

export const requireBusinessAccess = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
  }
  if (req.user.role === Roles.SuperAdmin.toString()) {
    return next();
  }
  const businessId =
    (req.params && (req.params as any).businessId) ||
    (req.body && (req.body as any).businessId) ||
    (req.query && (req.query as any).businessId) ||
    req.user.businessId;
  if (!businessId) {
    return fail(res, "Business id missing", 400, "BAD_REQUEST");
  }
  if (String(businessId) !== String(req.user.businessId)) {
    return fail(res, "Forbidden", 403, "FORBIDDEN");
  }
  return next();
};

export const requireAppointmentOwnerOrAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    }
    const appointmentId = (req.params as any).id;
    if (!appointmentId) {
      return fail(res, "Appointment id missing", 400, "BAD_REQUEST");
    }
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      return fail(res, "Appointment not found", 404, "NOT_FOUND");
    }
    if (req.user.role === Roles.SuperAdmin.toString()) {
      return next();
    }
    if (
      req.user.role === Roles.BusinessAdmin.toString() &&
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
    return fail(res, "Forbidden", 403, "FORBIDDEN");
  } catch (err) {
    return next(err);
  }
};

export default {
  requireAuth,
  requireRole,
  requireBusinessAccess,
  requireAppointmentOwnerOrAdmin,
};
