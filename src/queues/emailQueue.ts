import crypto from "node:crypto";
import { sendEmailTask } from "../workers/email.worker";
import { emailJobSchema, type EmailJob } from "../workers/email-job.schema";
import { getWorkerUtils } from "./queue";

export interface EmailJobOptions {
  attempts?: number;
  delayMs?: number;
  idempotencyKey?: string;
}

export type EmailDeliveryMode = "inline" | "worker";

function isVercelRuntime(): boolean {
  if (
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.VERCEL_TARGET_ENV)
  ) {
    return true;
  }

  // VERCEL* system variables may be disabled in project settings. APP_URL is
  // already required in production, so the canonical *.vercel.app API origin
  // is a reliable fallback for the current serverless deployment.
  const appUrl = process.env.APP_URL;
  if (!appUrl) return false;

  try {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export function getEmailDeliveryMode(): EmailDeliveryMode {
  const configured = process.env.EMAIL_DELIVERY_MODE?.trim().toLowerCase();
  if (configured === "inline" || configured === "worker") return configured;
  if (configured) {
    throw new Error(
      'EMAIL_DELIVERY_MODE must be either "inline" or "worker"',
    );
  }

  // Vercel functions do not execute server.ts, so the long-lived embedded
  // Graphile Worker is never started there. Deliver synchronously using the
  // same task/provider implementation instead of persisting jobs that have no
  // consumer. Long-lived/container runtimes keep the durable worker default.
  return isVercelRuntime() ? "inline" : "worker";
}

function stableIdempotencyKey(job: EmailJob, explicit?: string): string {
  if (explicit) return explicit;
  if (job.idempotencyKey) return job.idempotencyKey;

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(job))
    .digest("hex");
  return `systemly-email-${hash}`;
}

/**
 * Dispatch an email using the runtime-appropriate delivery mode.
 *
 * Long-lived runtimes persist the job before acknowledging the HTTP request.
 * Vercel delivers inline because there is no persistent worker process there.
 */
export async function enqueueSendEmail(
  input: unknown,
  options: EmailJobOptions = {},
) {
  const parsed = emailJobSchema.parse(input);
  const idempotencyKey = stableIdempotencyKey(
    parsed,
    options.idempotencyKey,
  );
  const job = emailJobSchema.parse({ ...parsed, idempotencyKey });

  if (getEmailDeliveryMode() === "inline") {
    if (typeof options.delayMs === "number" && options.delayMs > 0) {
      throw new Error("Delayed email jobs require EMAIL_DELIVERY_MODE=worker");
    }

    await sendEmailTask(job);
    return { id: null, deliveryMode: "inline" as const };
  }

  const workerUtils = await getWorkerUtils();
  return workerUtils.addJob("send_email", job, {
    jobKey: `email:${idempotencyKey}`,
    maxAttempts: options.attempts ?? 5,
    ...(typeof options.delayMs === "number"
      ? { runAt: new Date(Date.now() + options.delayMs) }
      : {}),
  });
}

/** Compatibility entrypoint for the active staff-invitation flow. */
export async function enqueueEmailJob(
  name: string,
  data: Record<string, unknown>,
  options: EmailJobOptions = {},
) {
  if (name === "staff_invite") {
    return enqueueSendEmail(
      {
        type: "staff_invite",
        to: data.to,
        data: {
          inviterName: data.inviterName,
          businessName: data.businessName,
          acceptUrl: data.acceptUrl,
          locale: data.locale ?? "en",
        },
        idempotencyKey: data.idempotencyKey,
      },
      options,
    );
  }

  if (
    name === "verification" ||
    name === "welcome" ||
    name === "password_reset" ||
    name === "send_email"
  ) {
    return enqueueSendEmail(
      name === "send_email" ? data : { type: name, ...data },
      options,
    );
  }

  throw new Error(`Unsupported email job: ${name}`);
}

export async function initEmailQueue() {
  if (getEmailDeliveryMode() === "worker") {
    await getWorkerUtils();
  }
}
