import { Router } from "express";
import servicesController from "./services.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import { createServiceSchema, updateServiceSchema } from "./services.schema";

const router = Router();

router.get("/", requireAuth, servicesController.list);
router.post(
  "/",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(createServiceSchema),
  servicesController.create
);
router.patch(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(updateServiceSchema),
  servicesController.update
);
router.delete(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  servicesController.remove
);

export default router;
