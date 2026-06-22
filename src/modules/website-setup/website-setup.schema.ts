import { z } from "zod";

export const templateIdValues = [
  "modern",
  "calm-clinic",
  "salon-editorial",
  "minimal",
] as const;

export const templateValues = ["modern", "minimal"] as const;
export const fontIdValues = [
  "geist",
  "cormorant",
  "inter",
  "playfair",
  "cairo",
] as const;

const dayHoursSchema = z.object({
  closed: z.boolean(),
  start: z.string(),
  end: z.string(),
});

const weeklyHoursSchema = z.object({
  sat: dayHoursSchema,
  sun: dayHoursSchema,
  mon: dayHoursSchema,
  tue: dayHoursSchema,
  wed: dayHoursSchema,
  thu: dayHoursSchema,
  fri: dayHoursSchema,
});

const onboardingServiceSchema = z.object({
  duration: z.string(),
  id: z.string().min(1),
  name: z.string(),
  price: z.string(),
  summary: z.string(),
});

const onboardingStaffMemberSchema = z.object({
  assignedServiceIds: z.array(z.string().min(1)),
  hours: weeklyHoursSchema,
  id: z.string().min(1),
  name: z.string(),
  role: z.string(),
});

const businessSiteFaqSchema = z.object({
  id: z.string().min(1),
  question: z.string(),
  answer: z.string(),
});

const businessSiteTestimonialSchema = z.object({
  id: z.string().min(1),
  authorName: z.string(),
  authorRole: z.string(),
  quote: z.string(),
});

const businessSiteStatSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  value: z.string(),
});

const customSectionVariantSchema = z.enum([
  "custom",
  "gallery",
  "memberships",
  "before-after",
  "offers",
  "founders-note",
  "contact-strip",
]);

const businessSectionIdSchema = z
  .string()
  .refine(
    (value) =>
      [
        "hero",
        "services",
        "testimonials",
        "faq",
        "team",
        "booking",
      ].includes(value) || value.startsWith("custom-"),
    "Invalid section id"
  );

const businessSiteCustomSectionSchema = z.object({
  id: z.string().regex(/^custom-.+$/),
  variant: customSectionVariantSchema,
  eyebrow: z.string(),
  title: z.string(),
  body: z.string(),
  ctaLabel: z.string(),
  ctaHref: z.string(),
});

const businessSiteStaffMemberSchema = z.object({
  assignedServiceIds: z.array(z.string().min(1)),
  hours: weeklyHoursSchema,
  id: z.string().min(1),
  name: z.string(),
  photoUrl: z.string(),
  role: z.string(),
  summary: z.string(),
});

const businessSiteDraftSchemaBase = z.object({
  basics: z.object({
    address: z.string(),
    category: z.string(),
    city: z.string(),
    name: z.string(),
    slug: z.string(),
    whatsapp: z.string(),
  }),
  content: z.object({
    about: z.string(),
    amenities: z.array(z.string()),
    announcementBar: z.string(),
    bookingCta: z.string(),
    customSections: z.array(businessSiteCustomSectionSchema),
    faq: z.array(businessSiteFaqSchema),
    heroSubtitle: z.string(),
    heroTitle: z.string(),
    metaDescription: z.string(),
    policies: z.array(z.string()),
    stats: z.array(businessSiteStatSchema),
    tagline: z.string(),
    testimonials: z.array(businessSiteTestimonialSchema),
    trustHighlights: z.array(z.string()),
  }),
  imagery: z.object({
    alt: z.string(),
    eyebrow: z.string(),
    heroImage: z.string(),
    heroNote: z.string(),
    previewImage: z.string(),
    previewNote: z.string(),
    tags: z.array(z.string()),
  }),
  presetId: z.enum(templateIdValues),
  sections: z.object({
    hidden: z.array(businessSectionIdSchema),
    order: z.array(businessSectionIdSchema),
  }),
  services: z.array(onboardingServiceSchema),
  staff: z.array(businessSiteStaffMemberSchema),
  template: z.enum(templateValues),
  theme: z.object({
    fontId: z.enum(fontIdValues),
    primaryColor: z.string(),
    secondaryColor: z.string(),
  }),
});

export const businessSiteDraftSchema = businessSiteDraftSchemaBase.superRefine(
  (value, ctx) => {
    const customIds = new Set(value.content.customSections.map((item) => item.id));
    const customIdCounts = new Map<string, number>();
    for (const item of value.content.customSections) {
      customIdCounts.set(item.id, (customIdCounts.get(item.id) || 0) + 1);
    }
    for (const [id, count] of customIdCounts.entries()) {
      if (count > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["content", "customSections"],
          message: `Duplicate custom section id: ${id}`,
        });
      }
    }

    const serviceIds = new Set<string>();
    for (const [index, service] of value.services.entries()) {
      if (serviceIds.has(service.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["services", index, "id"],
          message: `Duplicate service id: ${service.id}`,
        });
      }
      serviceIds.add(service.id);
    }

    const staffIds = new Set<string>();
    for (const [index, staffMember] of value.staff.entries()) {
      if (staffIds.has(staffMember.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["staff", index, "id"],
          message: `Duplicate staff id: ${staffMember.id}`,
        });
      }
      staffIds.add(staffMember.id);

      for (const assignedServiceId of staffMember.assignedServiceIds) {
        if (!serviceIds.has(assignedServiceId)) {
          ctx.addIssue({
            code: "custom",
            path: ["staff", index, "assignedServiceIds"],
            message: `Unknown service id: ${assignedServiceId}`,
          });
        }
      }
    }

    for (const key of ["order", "hidden"] as const) {
      for (const [index, sectionId] of value.sections[key].entries()) {
        if (sectionId.startsWith("custom-") && !customIds.has(sectionId)) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", key, index],
            message: `Unknown custom section id: ${sectionId}`,
          });
        }
      }
    }
  }
);

export const onboardingDraftSchema = z.object({
  basics: z.object({
    businessName: z.string(),
    category: z.string(),
    city: z.string(),
    slug: z.string(),
    tagline: z.string(),
    whatsapp: z.string(),
  }),
  imagery: z.object({
    coverPhotoUrl: z.string(),
    uploadStatus: z.enum(["idle", "local-preview", "uploaded", "error"]),
  }),
  publishedAt: z.string().nullable(),
  services: z.array(onboardingServiceSchema),
  siteDraft: businessSiteDraftSchema,
  staff: z.array(onboardingStaffMemberSchema),
  step: z.number().int(),
  templateId: z.enum(templateIdValues),
});

export const websiteSetupParamsSchema = z.object({
  businessId: z.string().min(1),
});

export const saveWebsiteSetupSchema = z.object({
  draft: onboardingDraftSchema,
  expectedVersion: z.number().int().nonnegative(),
});

export const publishWebsiteSetupSchema = saveWebsiteSetupSchema;

export const slugAvailabilityQuerySchema = z.object({
  slug: z.string().min(1),
});

export const updateSiteDraftSchema = z.object({
  draft: businessSiteDraftSchema,
  expectedVersion: z.number().int().nonnegative(),
});

export type BusinessSiteDraftDto = z.infer<typeof businessSiteDraftSchema>;
export type OnboardingDraftDto = z.infer<typeof onboardingDraftSchema>;
export type SaveWebsiteSetupInput = z.infer<typeof saveWebsiteSetupSchema>;
export type UpdateSiteDraftInput = z.infer<typeof updateSiteDraftSchema>;
export type SlugAvailabilityQuery = z.infer<typeof slugAvailabilityQuerySchema>;
