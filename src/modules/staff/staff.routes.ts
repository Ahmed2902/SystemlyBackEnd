import { CommissionType, Roles } from "@prisma/client";
import { Router } from "express";
import staffController from "./staff.controller";
import staffWorkspaceController from "./staff.workspace.controller";
import staffPhotoController from "./staff-photo.controller";
import staffInviteController from "./staff-invite.controller";
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

router.get("/", staffWorkspaceController.list);
router.post(
  "/",
  validate.validateBody(createStaffSchema),
  staffWorkspaceController.create,
);
router.get("/:id/workspace", staffWorkspaceController.workspace);
router.patch(
  "/:id",
  validate.validateBody(updateStaffSchema),
  staffWorkspaceController.update,
);
router.delete(
  "/:id",
  requireRole(OWNER_ROLES),
  staffWorkspaceController.deactivate,
);

router.post("/:id/photo/presign", staffPhotoController.presign);
router.post("/:id/photo/confirm", staffPhotoController.confirm);
router.delete("/:id/photo", staffPhotoController.remove);

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
  staffWorkspaceController.replaceAvailability,
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
  staffWorkspaceController.createBreak,
);
router.delete("/:id/breaks/:breakId", staffWorkspaceController.deleteBreak);

router.post(
  "/:id/time-off",
  validate.validateBody(createTimeOffSchema),
  staffWorkspaceController.createTimeOff,
);
router.delete(
  "/:id/time-off/:timeOffId",
  staffWorkspaceController.deleteTimeOff,
);

router.get(
  "/:id/commission",
  requireRole(OWNER_ROLES),
  staffController.getCommission,
);

router.post(
  "/invites",
  requireBusinessAccess,
  requireRole([Roles.BusinessAdmin]),
  validate.validateBody(createInviteSchema),
  staffInviteController.create,
);
router.post(
  "/invites/accept",
  validate.validateBody(acceptInviteSchema),
  staffInviteController.accept,
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
