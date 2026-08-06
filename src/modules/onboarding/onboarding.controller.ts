import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { fail, ok } from "../../shared/utils/response.util";
import onboardingMediaService from "./onboarding-media.service";
import { completeOnboardingSchema } from "./onboarding.schema";
import onboardingService from "./onboarding.service";

const onboardingMediaKindSchema = z.enum([
  "asset",
  "logo",
  "hero",
  "gallery",
  "staff",
]);
const imageContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function completeOnboarding(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    const input = completeOnboardingSchema.parse(req.body);
    const business = await onboardingService.completeOnboarding(userId, input);
    return res.status(201).json({ business });
  } catch (error) {
    return next(error);
  }
}

export async function presignOnboardingMedia(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    const kind = onboardingMediaKindSchema.safeParse(req.params.kind);
    const contentType = imageContentTypeSchema.safeParse(req.body?.contentType);
    if (!kind.success) return next(kind.error);
    if (!contentType.success) return next(contentType.error);
    return ok(
      res,
      await onboardingMediaService.createUploadTicket(
        userId,
        kind.data,
        contentType.data,
      ),
    );
  } catch (error) {
    return next(error);
  }
}

export async function confirmOnboardingMedia(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    const kind = onboardingMediaKindSchema.safeParse(req.params.kind);
    const body = z
      .object({ objectPath: z.string().min(1) })
      .safeParse(req.body);
    if (!kind.success) return next(kind.error);
    if (!body.success) return next(body.error);
    return ok(
      res,
      await onboardingMediaService.confirm(
        userId,
        kind.data,
        body.data.objectPath,
      ),
    );
  } catch (error) {
    return next(error);
  }
}
