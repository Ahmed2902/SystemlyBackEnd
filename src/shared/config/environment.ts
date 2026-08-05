import { z } from "zod";

const nodeEnvironmentSchema = z.enum(["development", "test", "production"]);

const environmentSchema = z
  .object({
    NODE_ENV: nodeEnvironmentSchema.default("development"),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().url().optional(),
    JWT_SECRET: z.string().optional(),
    JWT_REFRESH_SECRET: z.string().optional(),
    CSRF_SECRET: z.string().optional(),
    FRONTEND_URL: z.string().url().optional(),
    APP_URL: z.string().url().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_STORAGE_BUCKET: z.string().optional(),
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== "production") return;

    const required = [
      "JWT_SECRET",
      "JWT_REFRESH_SECRET",
      "CSRF_SECRET",
      "FRONTEND_URL",
      "APP_URL",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "SENTRY_DSN",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_STORAGE_BUCKET",
    ] as const;

    for (const key of required) {
      if (!environment[key]?.trim()) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required in production`,
        });
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  values: NodeJS.ProcessEnv = process.env,
): Environment {
  const result = environmentSchema.safeParse(values);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid application environment: ${problems}`);
}

export const environment = validateEnvironment();
