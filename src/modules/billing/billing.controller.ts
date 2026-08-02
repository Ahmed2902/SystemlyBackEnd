import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import { subscriptionActionBodySchema } from "./billing.schema";
import billingService from "./billing.service";
import paymob from "./paymob";

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

      const subscription = await billingService.findSubscription(businessId);
      return ok(res, { subscription });
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
        payment: result.payment,
        subscription: result.subscription,
      });
    } catch (error) {
      return next(error);
    }
  }

  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const bodyForVerify = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : JSON.stringify(req.body);
      const verification = await paymob.verifyWebhook(
        req.headers as any,
        bodyForVerify,
      );

      if (verification.verified) {
        const handled = await billingService.handlePaymobPayload(
          verification.payload,
        );
        if (handled.handled) {
          return res.status(200).json({ success: true });
        }
      }

      return res.status(200).json({ success: true, handled: false });
    } catch (error) {
      return next(error);
    }
  }
}

export default new BillingController();
