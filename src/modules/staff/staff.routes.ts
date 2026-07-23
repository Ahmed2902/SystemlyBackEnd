import { CommissionType, Roles } from "@prisma/client";
import { Router } from "express";
import staffController from "./staff.controller";
import staffWorkspaceController from "./staff.workspace.controller";
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

// Directory and profile workspace
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

// Service assignment and owner-only commission management
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

// Weekly availability supports multiple intervals per day.
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

// Staff-specific partial-day breaks.
router.post(
  "/:id/breaks",
  validate.validateBody(createStaffBreakSchema),
  staffWorkspaceController.createBreak,
);
router.delete("/:id/breaks/:breakId", staffWorkspaceController.deleteBreak);

// Full-day date-range time off.
router.post(
  "/:id/time-off",
  validate.validateBody(createTimeOffSchema),
  staffWorkspaceController.createTimeOff,
);
router.delete(
  "/:id/time-off/:timeOffId",
  staffWorkspaceController.deleteTimeOff,
);

// Financial reporting remains owner-only.
router.get(
  "/:id/commission",
  requireRole(OWNER_ROLES),
  staffController.getCommission,
);

// Account invites remain available for later, but V1 staff creation does not use them.
router.post(
  "/invites",
  requireBusinessAccess,
  requireRole([Roles.BusinessAdmin]),
  validate.validateBody(createInviteSchema),
  staffController.createInvite,
);
router.post(
  "/invites/accept",
  validate.validateBody(acceptInviteSchema),
  staffController.acceptInvite,
);

// Legacy calendar break endpoints kept for compatibility.
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
