import { Router } from "express";
import * as businessService from "../modules/business/business.service";

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

export default router;
