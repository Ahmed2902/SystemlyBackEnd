import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      service: "hgezli-backend",
      status: "ok",
      uptime: process.uptime(),
    },
  });
});

export default router;
