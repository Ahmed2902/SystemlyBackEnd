import { Router } from "express";
import * as businessService from "../modules/business/business.service";
import businessController from "../modules/business/business.controller";

const router = Router();

router.get("/check-slug/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;
    const taken = await businessService.isSlugTaken(slug);
    return res.json({ available: !taken, slug });
  } catch (err) {
    return next(err);
  }
});

// Public: full website data by slug
router.get("/public/:slug", businessController.getPublicBySlug);

export default router;
