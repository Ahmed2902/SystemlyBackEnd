import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import { doc } from "../../shared/middleware/doc.middleware";
import {
  completeOnboarding,
  confirmOnboardingMedia,
  presignOnboardingMedia,
} from "./onboarding.controller";

const router = Router();

router.use(requireAuth);

router.post(
  "/media/:kind/presign",
  doc({
    summary: "Create an onboarding media upload ticket",
    tags: ["onboarding"],
    responses: { 200: { description: "Signed public upload ticket" } },
  }),
  presignOnboardingMedia,
);

router.post(
  "/media/:kind/confirm",
  doc({
    summary: "Confirm an onboarding media upload",
    tags: ["onboarding"],
    responses: { 200: { description: "Verified public media reference" } },
  }),
  confirmOnboardingMedia,
);

router.post(
  "/complete",
  doc({
    summary: "Complete business onboarding",
    description:
      "Create the authenticated user's business and finish the initial onboarding setup.",
    tags: ["onboarding"],
    responses: {
      201: { description: "Business onboarding completed" },
    },
  }),
  completeOnboarding,
);

export default router;
