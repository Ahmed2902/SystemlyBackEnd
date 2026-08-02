import { CommissionType, Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import staffController from "./staff.controller";
import {
  acceptInviteSchema,
  assignServiceSchema,
  createInviteSchema,
  createStaffBreakSchema,
  createStaffSchema,
  createTimeOffSchema,
  overridesSchema,
  replaceAvailabilitySchema,
  updateServiceStaffSchema,
  updateStaffSchema,
} from "./staff.schema";

const router = Router();
const OWNER_ROLES = [Roles.BusinessAdmin, Roles.SuperAdmin];

const removeCommissionForOperationalUsers = (req: any, _res: any, next: any) => {
  if (!OWNER_ROLES.includes(req.user?.role)) {
    req.body = {
      ...req.body,
      commissionType: CommissionType.NONE,
      commissionAmount: 0,
    };
  }
  next();
};

router.use(requireAuth);

// Invitation acceptance is the one authenticated staff action that happens
// before the user belongs to a business, so it stays outside subscription
// enforcement. Every subsequent staff request is tenant- and plan-scoped.
router.post(
  "/invites/accept",
  validate.validateBody(acceptInviteSchema),
  staffController.acceptInvite,
);

router.use(requireBusinessAccess, requireSubscriptionAccess);

router.get("/", staffController.list);
router.post("/", validate.validateBody(createStaffSchema), staffController.create);
router.get("/:id/workspace", staffController.workspace);
router.patch("/:id", validate.validateBody(updateStaffSchema), staffController.update);
router.delete("/:id", requireRole(OWNER_ROLES), staffController.deactivate);

router.post("/:id/photo/presign", staffController.presignPhoto);
router.post("/:id/photo/confirm", staffController.confirmPhoto);
router.delete("/:id/photo", staffController.removePhoto);

router.post(
  "/:id/services",
  removeCommissionForOperationalUsers,
  validate.validateBody(assignServiceSchema),
  staffController.assignServices,
);
router.get(
  "/:id/services/:serviceId",
  requireRole(OWNER_ROLES),
  staffController.getServiceStaff,
);
router.patch(
  "/:id/services/:serviceId",
  requireRole(OWNER_ROLES),
  validate.validateBody(updateServiceStaffSchema),
  staffController.updateServiceCommission,
);
router.delete("/:id/services/:serviceId", staffController.unassignService);

router.get("/:id/availability", staffController.getAvailability);
router.put(
  "/:id/availability",
  validate.validateBody(replaceAvailabilitySchema),
  staffController.replaceAvailability,
);
router.get(
  "/:id/availability/overrides",
  staffController.listAvailabilityOverridesForDate,
);
router.post(
  "/:id/availability/overrides",
  validate.validateBody(overridesSchema),
  staffController.addOverride,
);
router.delete(
  "/:id/availability/overrides/:overrideId",
  staffController.deleteOverride,
);

router.post(
  "/:id/breaks",
  validate.validateBody(createStaffBreakSchema),
  staffController.createBreak,
);
router.delete("/:id/breaks/:breakId", staffController.deleteBreak);

router.post(
  "/:id/time-off",
  validate.validateBody(createTimeOffSchema),
  staffController.createTimeOff,
);
router.delete("/:id/time-off/:timeOffId", staffController.deleteTimeOff);

router.get(
  "/:id/commission",
  requireRole(OWNER_ROLES),
  staffController.getCommission,
);

router.post(
  "/invites",
  requireRole(OWNER_ROLES),
  validate.validateBody(createInviteSchema),
  staffController.createInvite,
);

router.get("/breaks", staffController.listStaffBreaksForDate);
router.post("/breaks", staffController.createStaffBreak);
router.delete("/breaks/:id", staffController.removeStaffBreak);

export default router;
