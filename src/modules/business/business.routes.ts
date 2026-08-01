import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import businessController from "./business.controller";
import {
  createBusinessSchema,
  publishBusinessSchema,
  slugParamsSchema,
  updateBusinessSchema,
} from "./business.schema";
import businessService from "./business.service";

const router = Router();

// Business creation remains outside subscription enforcement because it is the
// action that creates the business and its lifetime trial in one transaction.
router.post(
  "/",
  requireAuth,
  validate.validateBody(createBusinessSchema),
  businessController.create,
);

router.get(
  "/check-slug/:slug",
  validate.validateParams(slugParamsSchema),
  async (req, res, next) => {
    try {
      const slug = Array.isArray(req.params.slug)
        ? req.params.slug[0]
        : req.params.slug;
      const taken = await businessService.isSlugTaken(slug);
      return res.json({ available: !taken, slug });
    } catch (error) {
      return next(error);
    }
  },
);

// Public subscription gating is added separately in the public-access PR.
router.get("/public/:slug", businessController.getPublicBySlug);

router.patch(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  requireSubscriptionAccess,
  validate.validateBody(updateBusinessSchema),
  businessController.update,
);

router.patch(
  "/:id/publish",
  requireAuth,
  requireBusinessAccess,
  requireSubscriptionAccess,
  validate.validateBody(publishBusinessSchema),
  businessController.publish,
);

export default router;
