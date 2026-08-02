import type { NextFunction, Request, Response } from "express";
import { resolveSubscriptionAccess } from "../subscriptions/subscription-access.service";
import { fail, ok } from "../../shared/utils/response.util";
import { subscriptionActionBodySchema } from "./billing.schema";
import billingService from "./billing.service";

function authenticatedBusinessId(req: Request, res: Response) {
  const businessId = req.user?.businessId;
  if (!businessId) {
    fail(res, "Business context missing", 403, "BUSINESS_CONTEXT_REQUIRED");
    return null;
  }
  return businessId;
}

class BillingController {
  async getSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = authenticatedBusinessId(req, res);
      if (!businessId) return;

      const [subscription, access] = await Promise.all([
        billingService.findSubscription(businessId),
        resolveSubscriptionAccess(businessId, req.user?.role ?? null),
      ]);
      return ok(res, { subscription, access });
    } catch (error) {
      return next(error);
    }
  }

  async createCheckout(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = subscriptionActionBodySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const businessId = authenticatedBusinessId(req, res);
      if (!businessId) return;

      const result = await billingService.createCheckout(
        businessId,
        parsed.data.planId,
      );
      return ok(res, {
        payment: {
          id: result.payment.id,
          status: result.payment.status,
          amountCents: result.payment.amountCents,
          currency: result.payment.currency,
          expiresAt: result.payment.expiresAt,
        },
        checkoutUrl: result.checkoutUrl,
        reused: result.reused,
      });
    } catch (error) {
      return next(error);
    }
  }
}

export default new BillingController();
