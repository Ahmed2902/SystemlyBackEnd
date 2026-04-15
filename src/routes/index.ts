import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import businessRoutes from "./business.routes";
import websiteContentRoutes from "../modules/website-content/website-content.routes";
import staffRoutes from "../modules/staff/staff.routes";
import servicesRoutes from "../modules/services/services.routes";
import customersRoutes from "../modules/customers/customers.routes";

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

router.use("/auth", authRoutes);
router.use("/businesses", businessRoutes);
router.use("/website-content", websiteContentRoutes);
router.use("/staff", staffRoutes);
router.use("/services", servicesRoutes);
router.use("/customers", customersRoutes);

export default router;
