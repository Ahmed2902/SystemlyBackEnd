import { Router } from "express";
import { Roles } from "@prisma/client";
import {
  requireAuth,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import { doc } from "../../shared/middleware/doc.middleware";
import settingsController from "./settings.controller";

const router = Router();

router.use(requireAuth, requireRole(Roles.BusinessAdmin));

router.get(
  "/",
  doc({
    summary: "Get business settings",
    description:
      "Return the authenticated business profile, website settings, and publication state.",
    tags: ["settings"],
    responses: {
      200: { description: "Business settings returned" },
    },
  }),
  settingsController.get,
);
router.patch(
  "/business",
  doc({
    summary: "Update business settings",
    description:
      "Update the authenticated business profile and operational details.",
    tags: ["settings"],
    responses: {
      200: { description: "Business settings updated" },
    },
  }),
  settingsController.updateBusiness,
);
router.patch(
  "/website",
  doc({
    summary: "Update website settings",
    description:
      "Update public website content and configuration for the authenticated business.",
    tags: ["settings"],
    responses: {
      200: { description: "Website settings updated" },
    },
  }),
  settingsController.updateWebsite,
);
router.patch(
  "/publish",
  doc({
    summary: "Update website publication status",
    description:
      "Publish or unpublish the authenticated business public website.",
    tags: ["settings"],
    responses: {
      200: { description: "Website publication status updated" },
    },
  }),
  settingsController.publish,
);
router.post(
  "/branding/:kind/presign",
  doc({
    summary: "Create a branding upload URL",
    description:
      "Create a temporary upload URL for the authenticated business logo or cover image.",
    tags: ["settings"],
    responses: {
      200: { description: "Branding upload URL created" },
    },
  }),
  settingsController.presign,
);
router.post(
  "/branding/:kind/confirm",
  doc({
    summary: "Confirm a branding upload",
    description:
      "Confirm an uploaded logo or cover image and attach it to the authenticated business.",
    tags: ["settings"],
    responses: {
      200: { description: "Branding upload confirmed" },
    },
  }),
  settingsController.confirm,
);
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
