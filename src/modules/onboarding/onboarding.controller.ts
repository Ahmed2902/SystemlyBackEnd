import { Request, Response, NextFunction } from "express";
import { completeOnboardingSchema } from "./onboarding.schema";
import onboardingService from "./onboarding.service";

export async function completeOnboarding(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const input = completeOnboardingSchema.parse(req.body);
    const business = await onboardingService.completeOnboarding(
      req.user!.id,
      input,
    );
    res.status(201).json({ business });
  } catch (err) {
    next(err);
  }
}
