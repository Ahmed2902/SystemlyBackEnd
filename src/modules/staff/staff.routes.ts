import { CommissionType, Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import {
  requireAvailabilityOverrideAccess,
  requireLegacyBreakAccess,
  requireServiceBodyAccess,
  requireServiceParamAccess,
  requireStaffAccess,
  requireStaffBodyAccess,
  requireStaffBreakAccess,
  requireStaffTimeOffAccess,
} from "../../shared/middleware/tenant-resource.middleware";
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

router.post(
  "/invites/accept",
  validate.validateBody(acceptInviteSchema),
  staffController.acceptInvite,
);

router.use(requireBusinessAccess, requireSubscriptionAccess);

router.get("/", staffController.list);
router.post("/", validate.validateBody(createStaffSchema), staffController.create);
router.get("/:id/workspace", requireStaffAccess, staffController.workspace);
router.patch(
  "/:id",
  requireStaffAccess,
  validate.validateBody(updateStaffSchema),
  staffController.update,
);
router.delete(
  "/:id",
  requireStaffAccess,
  requireRole(OWNER_ROLES),
  staffController.deactivate,
);

router.post("/:id/photo/presign", requireStaffAccess, staffController.presignPhoto);
router.post("/:id/photo/confirm", requireStaffAccess, staffController.confirmPhoto);
router.delete("/:id/photo", requireStaffAccess, staffController.removePhoto);

router.post(
  "/:id/services",
  requireStaffAccess,
  removeCommissionForOperationalUsers,
  validate.validateBody(assignServiceSchema),
  requireServiceBodyAccess(),
  staffController.assignServices,
);
router.get(
  "/:id/services/:serviceId",
  requireStaffAccess,
  requireServiceParamAccess(),
  requireRole(OWNER_ROLES),
  staffController.getServiceStaff,
);
router.patch(
  "/:id/services/:serviceId",
  requireStaffAccess,
  requireServiceParamAccess(),
  requireRole(OWNER_ROLES),
  validate.validateBody(updateServiceStaffSchema),
  staffController.updateServiceCommission,
);
router.delete(
  "/:id/services/:serviceId",
  requireStaffAccess,
  requireServiceParamAccess(),
  staffController.unassignService,
);

router.get("/:id/availability", requireStaffAccess, staffController.getAvailability);
router.put(
  "/:id/availability",
  requireStaffAccess,
  validate.validateBody(replaceAvailabilitySchema),
  staffController.replaceAvailability,
);
router.get(
  "/:id/availability/overrides",
  requireStaffAccess,
  staffController.listAvailabilityOverridesForDate,
);
router.post(
  "/:id/availability/overrides",
  requireStaffAccess,
  validate.validateBody(overridesSchema),
  staffController.addOverride,
);
router.delete(
  "/:id/availability/overrides/:overrideId",
  requireStaffAccess,
  requireAvailabilityOverrideAccess,
  staffController.deleteOverride,
);

router.post(
  "/:id/breaks",
  requireStaffAccess,
  validate.validateBody(createStaffBreakSchema),
  staffController.createBreak,
);
router.delete(
  "/:id/breaks/:breakId",
  requireStaffAccess,
  requireStaffBreakAccess,
  staffController.deleteBreak,
);

router.post(
  "/:id/time-off",
  requireStaffAccess,
  validate.validateBody(createTimeOffSchema),
  staffController.createTimeOff,
);
router.delete(
  "/:id/time-off/:timeOffId",
  requireStaffAccess,
  requireStaffTimeOffAccess,
  staffController.deleteTimeOff,
);

router.get(
  "/:id/commission",
  requireStaffAccess,
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
router.post("/breaks", requireStaffBodyAccess(), staffController.createStaffBreak);
router.delete("/breaks/:id", requireLegacyBreakAccess, staffController.removeStaffBreak);

export default router;
