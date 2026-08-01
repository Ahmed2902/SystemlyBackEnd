import { Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import { doc } from "../../shared/middleware/doc.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import settingsController from "./settings.controller";

const router = Router();

router.use(
  requireAuth,
  requireBusinessAccess,
  requireRole(Roles.BusinessAdmin),
  requireSubscriptionAccess,
);

router.get("/", settingsController.get);
router.patch("/business", settingsController.updateBusiness);
router.patch("/website", settingsController.updateWebsite);
router.patch("/publish", settingsController.publish);
router.post("/branding/:kind/presign", settingsController.presign);
router.post("/branding/:kind/confirm", settingsController.confirm);
router.delete(
  "/branding/:kind",
  doc({
    summary: "Remove a branding asset",
    description:
      "Remove the selected logo or cover image from the authenticated business.",
    tags: ["settings"],
    responses: {
      200: { description: "Branding asset removed" },
    },
  }),
  settingsController.remove,
);

export default router;
