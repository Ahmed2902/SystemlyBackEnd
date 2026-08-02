import type { NextFunction, Request, Response } from "express";
import type { EntitlementKey } from "../../modules/subscriptions/subscription.catalog";
import {
  hasEntitlement,
  resolveSubscriptionAccess,
  SUBSCRIPTION_ACCESS_MODES,
  type SubscriptionAccessSnapshot,
} from "../../modules/subscriptions/subscription-access.service";
import { fail } from "../utils/response.util";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function accessForRequest(req: Request) {
  if (req.subscriptionAccess) return req.subscriptionAccess;

  const businessId = req.user?.businessId;
  if (!businessId) return null;

  const access = await resolveSubscriptionAccess(
    businessId,
    req.user?.role ?? null,
  );
  req.subscriptionAccess = access;
  return access;
}

function inactiveResponse(
  req: Request,
  res: Response,
  access: SubscriptionAccessSnapshot,
) {
  if (access.businessDeleted) {
    return fail(
      res,
      "This business account is closed.",
      403,
      "BUSINESS_ACCOUNT_CLOSED",
    );
  }

  if (access.mode === SUBSCRIPTION_ACCESS_MODES.OWNER_READ_ONLY) {
    return fail(
      res,
      "The subscription is inactive. Renew from Billing to make changes.",
      402,
      "SUBSCRIPTION_READ_ONLY",
    );
  }

  return fail(
    res,
    "The subscription is inactive. Contact the business owner.",
    402,
    "SUBSCRIPTION_INACTIVE",
  );
}

export async function requireSubscriptionAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const access = await accessForRequest(req);
    if (!access) {
      return fail(
        res,
        "Business context missing.",
        403,
        "BUSINESS_CONTEXT_REQUIRED",
      );
    }

    if (access.mode === SUBSCRIPTION_ACCESS_MODES.FULL) return next();

    if (
      access.mode === SUBSCRIPTION_ACCESS_MODES.OWNER_READ_ONLY &&
      READ_ONLY_METHODS.has(req.method.toUpperCase())
    ) {
      return next();
    }

    return inactiveResponse(req, res, access);
  } catch (error) {
    return next(error);
  }
}

export function requireEntitlement(entitlement: EntitlementKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const access = await accessForRequest(req);
      if (!access) {
        return fail(
          res,
          "Business context missing.",
          403,
          "BUSINESS_CONTEXT_REQUIRED",
        );
      }

      if (access.mode !== SUBSCRIPTION_ACCESS_MODES.FULL) {
        return inactiveResponse(req, res, access);
      }

      if (!hasEntitlement(access, entitlement)) {
        return fail(
          res,
          "Your current plan does not include this feature.",
          403,
          "PLAN_FEATURE_REQUIRED",
        );
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
