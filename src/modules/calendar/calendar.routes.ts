import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import calendarController from "./calendar.controller";

const router = Router();

router.use(requireAuth);
router.get("/workspace", calendarController.getWorkspace);

export default router;
