import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import servicesController from "./services.controller";
import {
  createServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
} from "./services.schema";

const router = Router();

router.use(requireAuth, requireBusinessAccess, requireSubscriptionAccess);

router.get(
  "/",
  validate.validateQuery(listServicesQuerySchema),
  servicesController.list,
);
router.post(
  "/",
  validate.validateBody(createServiceSchema),
  servicesController.create,
);
router.patch(
  "/:id",
  validate.validateBody(updateServiceSchema),
  servicesController.update,
);
router.delete("/:id", servicesController.archive);

export default router;
