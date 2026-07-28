import { CommissionType, Roles } from "@prisma/client";
import { Router } from "express";
import staffController from "./staff.controller";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
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
  requireBusinessAccess,
  requireRole(OWNER_ROLES),
  validate.validateBody(createInviteSchema),
  staffController.createInvite,
);
router.post(
  "/invites/accept",
  validate.validateBody(acceptInviteSchema),
  staffController.acceptInvite,
);

router.get(
  "/breaks",
  requireBusinessAccess,
  staffController.listStaffBreaksForDate,
);
router.post(
  "/breaks",
  requireBusinessAccess,
  staffController.createStaffBreak,
);
router.delete(
  "/breaks/:id",
  requireBusinessAccess,
  staffController.removeStaffBreak,
);

export default router;
