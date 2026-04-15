import { z } from "zod";

export const websiteContentSchema = z.object({
  tagline: z.string().optional(),
  aboutText: z.string().optional(),
  template: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  font: z.string().optional(),
  customDomain: z.string().optional(),
  sectionOrder: z.any().optional(),
  showTeam: z.boolean().optional(),
  showFaq: z.boolean().optional(),
  showReviews: z.boolean().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
});

export const parseWebsiteContent = (input: unknown) =>
  websiteContentSchema.parse(input);

export type WebsiteContentInput = z.infer<typeof websiteContentSchema>;
