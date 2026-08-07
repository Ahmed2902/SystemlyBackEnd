import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import {
  requireFaqAccess,
  requireFaqReorderAccess,
} from "../../shared/middleware/tenant-resource.middleware";
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
  requireFaqAccess,
  validate.validateBody(updateFaqSchema),
  faqsController.update,
);
router.delete("/:id", requireFaqAccess, faqsController.remove);
router.patch(
  "/reorder",
  validate.validateBody(reorderFaqsSchema),
  requireFaqReorderAccess,
  faqsController.reorder,
);

export default router;
