import { Roles } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { prisma } from "../db/prisma";
import { fail } from "../utils/response.util";

function businessId(req: Request, res: Response): string | null {
  if (req.user?.role === Roles.SuperAdmin) return null;
  if (req.user?.businessId) return req.user.businessId;
  fail(
    res,
    "Business context missing",
    403,
    "BUSINESS_CONTEXT_REQUIRED",
    req.requestId ?? null,
  );
  return null;
}

function notFound(res: Response, req: Request, resource: string) {
  return fail(
    res,
    `${resource} not found`,
    404,
    "NOT_FOUND",
    req.requestId ?? null,
  );
}

export const requireFaqAccess: RequestHandler = async (req, res, next) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const faq = await prisma.faq.findFirst({
    where: { id: String(req.params.id), businessId: tenantId },
    select: { id: true },
  });
  if (!faq) return notFound(res, req, "FAQ");
  return next();
};

export const requireFaqReorderAccess: RequestHandler = async (req, res, next) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const ids = [
    ...new Set(
      (Array.isArray(req.body) ? req.body : [])
        .map((item) => item?.id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const count = await prisma.faq.count({
    where: { businessId: tenantId, id: { in: ids } },
  });
  if (count !== ids.length) return notFound(res, req, "FAQ");
  return next();
};

export const requireStaffAccess: RequestHandler = async (req, res, next) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const staff = await prisma.staff.findFirst({
    where: { id: String(req.params.id), businessId: tenantId },
    select: { id: true },
  });
  if (!staff) return notFound(res, req, "Staff member");
  return next();
};

export const requireServiceParamAccess = (
  paramName = "serviceId",
): RequestHandler => async (req, res, next) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const service = await prisma.service.findFirst({
    where: { id: String(req.params[paramName]), businessId: tenantId },
    select: { id: true },
  });
  if (!service) return notFound(res, req, "Service");
  return next();
};

export const requireServiceBodyAccess = (
  fieldName = "serviceId",
): RequestHandler => async (req, res, next) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const service = await prisma.service.findFirst({
    where: { id: String(req.body?.[fieldName]), businessId: tenantId },
    select: { id: true },
  });
  if (!service) return notFound(res, req, "Service");
  return next();
};

export const requireAvailabilityOverrideAccess: RequestHandler = async (
  req,
  res,
  next,
) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const override = await prisma.availabilityOverride.findFirst({
    where: {
      id: String(req.params.overrideId),
      staffId: String(req.params.id),
      staff: { businessId: tenantId },
    },
    select: { id: true },
  });
  if (!override) return notFound(res, req, "Availability override");
  return next();
};

export const requireStaffBreakAccess: RequestHandler = async (req, res, next) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const item = await prisma.staffBreak.findFirst({
    where: {
      id: String(req.params.breakId),
      staffId: String(req.params.id),
      businessId: tenantId,
    },
    select: { id: true },
  });
  if (!item) return notFound(res, req, "Break");
  return next();
};

export const requireStaffTimeOffAccess: RequestHandler = async (
  req,
  res,
  next,
) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const item = await prisma.staffTimeOff.findFirst({
    where: {
      id: String(req.params.timeOffId),
      staffId: String(req.params.id),
      businessId: tenantId,
    },
    select: { id: true },
  });
  if (!item) return notFound(res, req, "Time-off entry");
  return next();
};

export const requireLegacyBreakAccess: RequestHandler = async (req, res, next) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const item = await prisma.staffBreak.findFirst({
    where: { id: String(req.params.id), businessId: tenantId },
    select: { id: true },
  });
  if (!item) return notFound(res, req, "Break");
  return next();
};

export const requireStaffBodyAccess = (
  fieldName = "staffId",
): RequestHandler => async (req, res, next) => {
  if (req.user?.role === Roles.SuperAdmin) return next();
  const tenantId = businessId(req, res);
  if (!tenantId) return;

  const staff = await prisma.staff.findFirst({
    where: { id: String(req.body?.[fieldName]), businessId: tenantId },
    select: { id: true },
  });
  if (!staff) return notFound(res, req, "Staff member");
  return next();
};
