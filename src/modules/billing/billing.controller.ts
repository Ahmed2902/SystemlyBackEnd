import type { Request, Response, NextFunction } from "express";
import * as billingService from "./billing.service";
import paymob from "./paymob";
import { ok, fail } from "../../shared/utils/response.util";

export const startTrial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = req.user?.businessId || req.body?.businessId;
    if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const planId = req.body?.planId;
    const sub = await billingService.startTrial(businessId, planId);
    return ok(res, { subscription: sub });
  } catch (err) {
    return next(err);
  }
};

export const webhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const verification = await paymob.verifyWebhook(req.headers as any, req.body);
    // TODO: map verified payload to subscription updates
    // eslint-disable-next-line no-console
    console.log("[BillingWebhook] Received payload", verification.payload);
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
};

export default { startTrial, webhook };
