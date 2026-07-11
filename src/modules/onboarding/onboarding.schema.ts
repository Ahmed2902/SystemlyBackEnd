import { z } from "zod";

const serviceSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1).max(255),
  category: z.string().max(80).optional(),
  priceEgp: z.number().positive(),
  durationMin: z.number().int().positive(),
});

const availabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const staffSchema = z.object({
  clientId: z.string(),
  name: z.string().min(1).max(255),
  role: z.enum(["Staff", "Receptionist"]),
  photoUrl: z.string().url().optional(),
  serviceClientIds: z.array(z.string()),
  availability: z.array(availabilitySchema),
});

const faqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

export const completeOnboardingSchema = z.object({
  vertical: z.string().min(1).max(80),
  templateId: z.string().min(1).max(80),
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  phone: z.string().min(1).max(30),
  city: z.string().max(120).optional(),
  address: z.string().optional(),
  tagline: z.string().optional(),
  aboutText: z.string().optional(),
  heroPhotoUrl: z.string().url().optional(),
  galleryPhotoUrls: z.array(z.string().url()).default([]),
  primaryColor: z.string().max(30),
  sectionOrder: z.array(z.string()),
  showTeam: z.boolean(),
  showFaq: z.boolean(),
  instagram: z.string().max(255).optional(),
  whatsapp: z.string().max(30).optional(),
  services: z.array(serviceSchema).min(1),
  staff: z.array(staffSchema).min(1),
  faqs: z.array(faqSchema).default([]),
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;
