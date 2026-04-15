import { Router } from "express";
import photosController from "./photos.controller";
import { requireAuth, requireBusinessAccess } from "../../shared/middleware/auth.middleware";
import { uploadSingle } from "../../shared/middleware/upload.middleware";

const router = Router();

router.post("/logo", requireAuth, requireBusinessAccess, uploadSingle, photosController.uploadLogo);
router.post("/cover", requireAuth, requireBusinessAccess, uploadSingle, photosController.uploadCover);

// Gallery endpoints - TODO: requires Photo model
router.post("/gallery", requireAuth, requireBusinessAccess, uploadSingle, photosController.uploadGallery);
router.delete("/gallery/:id", requireAuth, requireBusinessAccess, photosController.deleteGallery);

export default router;
