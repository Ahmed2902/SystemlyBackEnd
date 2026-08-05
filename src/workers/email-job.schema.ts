import { z } from "zod";

const emailLocaleSchema = z.enum(["en", "ar"]);

const jobEnvelopeSchema = z.object({
  to: z.string().email(),
  idempotencyKey: z.string().min(1).max(256).optional(),
});

const verificationJobSchema = jobEnvelopeSchema.extend({
  type: z.literal("verification"),
  data: z.object({
    name: z.string(),
    verificationUrl: z.string().url(),
    locale: emailLocaleSchema,
  }),
});

const welcomeJobSchema = jobEnvelopeSchema.extend({
  type: z.literal("welcome"),
  data: z.object({
    name: z.string(),
    dashboardUrl: z.string().url(),
    locale: emailLocaleSchema,
  }),
});

const passwordResetJobSchema = jobEnvelopeSchema.extend({
  type: z.literal("password_reset"),
  data: z.object({
    name: z.string(),
    resetUrl: z.string().url(),
    locale: emailLocaleSchema,
  }),
});

const staffInviteJobSchema = jobEnvelopeSchema.extend({
  type: z.literal("staff_invite"),
  data: z.object({
    inviterName: z.string().optional(),
    businessName: z.string().min(1),
    acceptUrl: z.string().url(),
    locale: emailLocaleSchema,
  }),
});

export const emailJobSchema = z.discriminatedUnion("type", [
  verificationJobSchema,
  welcomeJobSchema,
  passwordResetJobSchema,
  staffInviteJobSchema,
]);

export type EmailJob = z.infer<typeof emailJobSchema>;
