import { Router } from "express";
import * as businessService from "./business.service";
import businessController from "./business.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import {
  publishBusinessSchema,
  slugParamsSchema,
  updateBusinessSchema,
} from "./business.schema";

const router = Router();

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
    } catch (err) {
      return next(err);
    }
  }
);

// Public: full website data by slug
router.get("/public/:slug", businessController.getPublicBySlug);

// Auth: update business data (owner or admin)
router.patch(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(updateBusinessSchema),
  businessController.update
);

// Auth: publish/unpublish business
router.patch(
  "/:id/publish",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(publishBusinessSchema),
  businessController.publish
);

// Auth: business stats
router.get(
  "/:id/stats",
  requireAuth,
  requireBusinessAccess,
  businessController.stats
);

export default router;
