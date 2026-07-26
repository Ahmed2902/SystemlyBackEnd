import { z } from "zod";

export const websiteContentSchema = z.object({
  tagline: z.string().optional(),
  aboutText: z.string().optional(),
  template: z.string().max(80).optional(),
  primaryColor: z.string().max(30).optional(),
  secondaryColor: z.string().max(30).optional(),
  font: z.string().max(80).optional(),
  customDomain: z.string().max(255).optional(),
  sectionOrder: z.array(z.string()).optional(),
  showTeam: z.boolean().optional(),
  showFaq: z.boolean().optional(),
  showReviews: z.boolean().optional(),
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().optional(),
  instagramUrl: z.string().max(255).optional(),
  whatsappNumber: z.string().max(30).optional(),
});

export type WebsiteContentInput = z.infer<typeof websiteContentSchema>;

export const websiteContentSchemas = { websiteContentSchema };
