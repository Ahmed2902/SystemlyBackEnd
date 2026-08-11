import { Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccessFor,
  requireRole,
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
const BUSINESS_MANAGERS = [Roles.BusinessAdmin, Roles.SuperAdmin];

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

router.get("/public/sitemap", businessController.getPublicSitemapEntries);
router.get("/public/:slug", businessController.getPublicBySlug);

router.patch(
  "/:id",
  requireAuth,
  requireBusinessAccessFor("id"),
  requireRole(BUSINESS_MANAGERS),
  requireSubscriptionAccess,
  validate.validateBody(updateBusinessSchema),
  businessController.update,
);

router.patch(
  "/:id/publish",
  requireAuth,
  requireBusinessAccessFor("id"),
  requireRole(BUSINESS_MANAGERS),
  requireSubscriptionAccess,
  validate.validateBody(publishBusinessSchema),
  businessController.publish,
);

export default router;
