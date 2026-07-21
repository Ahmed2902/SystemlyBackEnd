import { z } from "zod";

/** Canonical website draft shared by onboarding and the website editor. */
export const businessSiteDraftSchema = z
  .any()
  .superRefine((value: any, ctx) => {
    const services = Array.isArray(value?.services) ? value.services : [];
    const staff = Array.isArray(value?.staff) ? value.staff : [];
    const serviceIds = services.map((service: any) => service?.id);
    if (new Set(serviceIds).size !== serviceIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Service ids must be unique",
        path: ["services"],
      });
    }
    const staffIds = staff.map((member: any) => member?.id);
    if (new Set(staffIds).size !== staffIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Staff ids must be unique",
        path: ["staff"],
      });
    }
    const validServices = new Set(serviceIds);
    staff.forEach((member: any, index: number) => {
      (member?.assignedServiceIds ?? []).forEach((id: string) => {
        if (!validServices.has(id))
          ctx.addIssue({
            code: "custom",
            message: "Staff references an unknown service",
            path: ["staff", index, "assignedServiceIds"],
          });
      });
    });
    const knownSections = new Set([
      "hero",
      "about",
      "services",
      "gallery",
      "team",
      "faq",
      "contact",
      "footer",
    ]);
    (value?.sections?.order ?? []).forEach((section: string, index: number) => {
      if (!knownSections.has(section))
        ctx.addIssue({
          code: "custom",
          message: "Unknown section",
          path: ["sections", "order", index],
        });
    });
  });

export type BusinessSiteDraft = z.infer<typeof businessSiteDraftSchema>;
