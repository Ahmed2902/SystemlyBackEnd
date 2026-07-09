import { Router } from "express";
import photosController from "./photos.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { uploadSingle } from "../../shared/middleware/upload.middleware";
import validate from "../../shared/middleware/validate.middleware";
import { photoIdParamsSchema } from "./photos.schema";
import Supabase from "../../shared/services/Supabase.Service";

const router = Router();

router.post(
  "/logo",
  requireAuth,
  requireBusinessAccess,
  uploadSingle,
  photosController.uploadLogo,
);
router.post(
  "/cover",
  requireAuth,
  requireBusinessAccess,
  uploadSingle,
  photosController.uploadCover,
);

// Gallery endpoints - TODO: requires Photo model
router.post(
  "/gallery",
  requireAuth,
  requireBusinessAccess,
  uploadSingle,
  photosController.uploadGallery,
);
router.delete(
  "/gallery/:id",
  requireAuth,
  requireBusinessAccess,
  validate.validateParams(photoIdParamsSchema),
  photosController.deleteGallery,
);

router.post("/gallery/presign", async (req, res, next) => {
  try {
    const { filePath, contentType } = req.body;

    // Calls the Supabase Storage client initialization function
    const uploadTicket = await Supabase.getUploadUrl(filePath, contentType);

    res.json({
      success: true,
      data: uploadTicket, // contains { uploadUrl, publicUrl }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
