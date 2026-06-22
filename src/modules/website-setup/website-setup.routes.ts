import { Router } from "express";
import websiteSetupController from "./website-setup.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";

const router = Router({ mergeParams: true });

router.get(
  "/website-setup",
  requireAuth,
  requireBusinessAccess,
  websiteSetupController.getSetup
);

router.put(
  "/website-setup",
  requireAuth,
  requireBusinessAccess,
  websiteSetupController.saveSetup
);

router.post(
  "/website-setup/publish",
  requireAuth,
  requireBusinessAccess,
  websiteSetupController.publish
);

router.get(
  "/slug-availability",
  requireAuth,
  requireBusinessAccess,
  websiteSetupController.checkSlugAvailability
);

router.patch(
  "/site-draft",
  requireAuth,
  requireBusinessAccess,
  websiteSetupController.updateSiteDraft
);

export default router;
