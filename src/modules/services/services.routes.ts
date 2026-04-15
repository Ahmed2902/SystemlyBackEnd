import { Router } from "express";
import servicesController from "./services.controller";
import { requireAuth, requireBusinessAccess } from "../../shared/middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, servicesController.list);
router.post("/", requireAuth, requireBusinessAccess, servicesController.create);
router.patch("/:id", requireAuth, requireBusinessAccess, servicesController.update);
router.delete("/:id", requireAuth, requireBusinessAccess, servicesController.remove);

export default router;
