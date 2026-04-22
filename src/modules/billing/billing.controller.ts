import type { Request, Response, NextFunction } from "express";
import * as billingService from "./billing.service";
import paymob from "./paymob";
import { ok, fail } from "../../shared/utils/response.util";
import { subscriptionActionBodySchema } from "./billing.schema";

export const startTrial = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = subscriptionActionBodySchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const businessId = req.user?.businessId || parsed.data.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const planId = parsed.data.planId;
    const sub = await billingService.startTrial(businessId, planId);
    return ok(res, { subscription: sub });
  } catch (err) {
    return next(err);
  }
};

export const webhook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const verification = await paymob.verifyWebhook(
      req.headers as any,
      req.body
    );
    // eslint-disable-next-line no-console
    console.log("[BillingWebhook] Received payload", verification.payload);

    if (verification.verified) {
      const handled = await billingService.handlePaymobPayload(
        verification.payload
      );
      if (handled && handled.handled)
        return res.status(200).json({ success: true });
    }

    return res.status(200).json({ success: true, handled: false });
  } catch (err) {
    return next(err);
  }
};

export const createCheckout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = subscriptionActionBodySchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const businessId = req.user?.businessId || parsed.data.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const planId = parsed.data.planId;
    const result = await billingService.createCheckout(businessId, planId);
    return ok(res, {
      payment: result.payment,
      subscription: result.subscription,
    });
  } catch (err) {
    return next(err);
  }
};

export default { startTrial, webhook, createCheckout };
