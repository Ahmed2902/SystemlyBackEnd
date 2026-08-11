import { z } from "zod";
import { isTemplateAllowedForVertical } from "../../shared/config/templates.config";

const serviceSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1).max(255),
  category: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  priceEgp: z.number().positive(),
  durationMin: z.number().int().positive(),
});

const availabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const sharedStaffFields = {
  clientId: z.string(),
  name: z.string().min(1).max(255),
  jobTitle: z.string().max(120).optional(),
  bio: z.string().max(3000).optional(),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  photoUrl: z.string().url().optional(),
  availability: z.array(availabilitySchema),
};

const staffSchema = z.discriminatedUnion("role", [
  z.object({
    ...sharedStaffFields,
    role: z.literal("Staff"),
    serviceClientIds: z
      .array(z.string())
      .min(1, "Service providers must be assigned at least one service"),
  }),
  z.object({
    ...sharedStaffFields,
    role: z.literal("Receptionist"),
    serviceClientIds: z.array(z.string()).default([]),
  }),
]);

const faqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const completeOnboardingSchema = z
  .object({
    vertical: z.enum(["salon", "clinic"]),
    templateId: z.string().min(1).max(80),
    name: z.string().min(1).max(255),
    slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
    branchName: z.string().trim().min(1).max(120).default("Main Branch"),
    branchSlug: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .default("main"),
    phone: z.string().min(1).max(30),
    city: z.string().max(120).optional(),
    address: z.string().optional(),
    timezone: z.string().min(1).max(80).default("Africa/Cairo"),
    language: z.enum(["en", "ar"]).default("en"),
    tagline: z.string().optional(),
    aboutText: z.string().optional(),
    heroPhotoUrl: z.string().url().optional(),
    logoUrl: z.string().url().optional(),
    galleryPhotoUrls: z.array(z.string().url()).default([]),
    primaryColor: z.string().max(30),
    secondaryColor: z.string().max(30),
    sectionOrder: z.array(z.string()),
    showTeam: z.boolean(),
    showFaq: z.boolean(),
    instagram: z.string().max(255).optional(),
    whatsapp: z.string().max(30).optional(),
    services: z.array(serviceSchema).min(1),
    staff: z.array(staffSchema).min(1),
    faqs: z.array(faqSchema).default([]),
  })
  .superRefine((input, context) => {
    if (!isTemplateAllowedForVertical(input.templateId, input.vertical)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["templateId"],
        message: "Template is not available for the selected business vertical",
      });
    }
  });

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
