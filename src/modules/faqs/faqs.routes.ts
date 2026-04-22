import { Router } from "express";
import faqsController from "./faqs.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import {
  createFaqSchema,
  reorderFaqsSchema,
  updateFaqSchema,
} from "./faqs.schema";

const router = Router();

router.get("/", requireAuth, faqsController.list);
router.post(
  "/",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(createFaqSchema),
  faqsController.create
);
router.patch(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(updateFaqSchema),
  faqsController.update
);
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
  validate.validateBody(reorderFaqsSchema),
  faqsController.reorder
);

export default router;
