import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import { doc } from "../../shared/middleware/doc.middleware";
import { completeOnboarding } from "./onboarding.controller";

const router = Router();

router.post(
  "/complete",
  requireAuth,
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
