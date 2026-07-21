import { Router } from "express";
import servicesController from "./services.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import {
  createServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
} from "./services.schema";

const router = Router();

router.use(requireAuth, requireBusinessAccess);

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
