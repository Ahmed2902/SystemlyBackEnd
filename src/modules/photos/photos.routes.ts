import { Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import photosController from "./photos.controller";
import {
  businessMediaKindParamsSchema,
  mediaConfirmSchema,
  mediaPresignSchema,
  photoIdParamsSchema,
} from "./photos.schema";

const router = Router();

router.use(
  requireAuth,
  requireBusinessAccess,
  requireSubscriptionAccess,
  requireRole([Roles.BusinessAdmin, Roles.SuperAdmin]),
);

router.post(
  "/:kind/presign",
  validate.validateParams(businessMediaKindParamsSchema),
  validate.validateBody(mediaPresignSchema),
  photosController.presign,
);
router.post(
  "/:kind/confirm",
  validate.validateParams(businessMediaKindParamsSchema),
  validate.validateBody(mediaConfirmSchema),
  photosController.confirm,
);
router.delete(
  "/gallery/:id",
  validate.validateParams(photoIdParamsSchema),
  photosController.deleteGallery,
);

export default router;
