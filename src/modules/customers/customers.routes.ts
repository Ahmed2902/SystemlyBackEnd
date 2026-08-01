import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import customersController from "./customers.controller";
import {
  createCustomerSchema,
  customerIdParamsSchema,
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
  updateCustomerSchema,
} from "./customers.schema";

const router = Router();

router.use(requireAuth, requireBusinessAccess, requireSubscriptionAccess);

router.get(
  "/",
  validate.validateQuery(listCustomersQuerySchema),
  customersController.list,
);
router.post(
  "/",
  validate.validateBody(createCustomerSchema),
  customersController.create,
);
router.get(
  "/:id/workspace",
  validate.validateParams(customerIdParamsSchema),
  customersController.workspace,
);
router.get(
  "/:id/appointments",
  validate.validateParams(customerIdParamsSchema),
  customersController.appointments,
);
router.patch(
  "/:id/notes",
  validate.validateParams(customerIdParamsSchema),
  validate.validateBody(updateCustomerNotesSchema),
  customersController.updateNotes,
);
router.patch(
  "/:id",
  validate.validateParams(customerIdParamsSchema),
  validate.validateBody(updateCustomerSchema),
  customersController.update,
);
router.get(
  "/:id",
  validate.validateParams(customerIdParamsSchema),
  customersController.get,
);

export default router;
