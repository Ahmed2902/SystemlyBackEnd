import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import faqsController from "./faqs.controller";
import {
  createFaqSchema,
  reorderFaqsSchema,
  updateFaqSchema,
} from "./faqs.schema";

const router = Router();

router.use(requireAuth, requireBusinessAccess, requireSubscriptionAccess);

router.get("/", faqsController.list);
router.post(
  "/",
  validate.validateBody(createFaqSchema),
  faqsController.create,
);
router.patch(
  "/:id",
  validate.validateBody(updateFaqSchema),
  faqsController.update,
);
router.delete("/:id", faqsController.remove);
router.patch(
  "/reorder",
  validate.validateBody(reorderFaqsSchema),
  faqsController.reorder,
);

export default router;
