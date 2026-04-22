import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import businessRoutes from "../modules/business/business.routes";
import websiteContentRoutes from "../modules/website-content/website-content.routes";
import staffRoutes from "../modules/staff/staff.routes";
import servicesRoutes from "../modules/services/services.routes";
import customersRoutes from "../modules/customers/customers.routes";
import faqsRoutes from "../modules/faqs/faqs.routes";
import photosRoutes from "../modules/photos/photos.routes";
import bookingRoutes from "../modules/bookings/bookings.routes";
import appointmentsRoutes from "../modules/appointments/appointments.routes";
import billingRoutes from "../modules/billing/billing.routes";
import docsRoutes from "../shared/docs/docs.routes";

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
router.use("/booking", bookingRoutes);
router.use("/appointments", appointmentsRoutes);
router.use("/faqs", faqsRoutes);
router.use("/photos", photosRoutes);
router.use("/billing", billingRoutes);
router.use("/docs", docsRoutes);

export default router;
