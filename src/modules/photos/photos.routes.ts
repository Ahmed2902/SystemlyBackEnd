import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import { uploadSingle } from "../../shared/middleware/upload.middleware";
import validate from "../../shared/middleware/validate.middleware";
import Supabase from "../../shared/services/Supabase.Service";
import photosController from "./photos.controller";
import { photoIdParamsSchema } from "./photos.schema";

const router = Router();

router.use(requireAuth, requireBusinessAccess, requireSubscriptionAccess);

router.post("/logo", uploadSingle, photosController.uploadLogo);
router.post("/cover", uploadSingle, photosController.uploadCover);
router.post("/gallery", uploadSingle, photosController.uploadGallery);
router.delete(
  "/gallery/:id",
  validate.validateParams(photoIdParamsSchema),
  photosController.deleteGallery,
);

router.post("/gallery/presign", async (req, res, next) => {
  try {
    const { filePath, contentType } = req.body;
    const uploadTicket = await Supabase.getUploadUrl(filePath, contentType);

    res.json({
      success: true,
      data: uploadTicket,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
