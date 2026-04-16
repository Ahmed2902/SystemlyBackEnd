import { Router } from "express";
import faqsController from "./faqs.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, faqsController.list);
router.post("/", requireAuth, requireBusinessAccess, faqsController.create);
router.patch("/:id", requireAuth, requireBusinessAccess, faqsController.update);
router.delete(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  faqsController.remove
);
router.patch(
  "/reorder",
  requireAuth,
  requireBusinessAccess,
  faqsController.reorder
);

export default router;
