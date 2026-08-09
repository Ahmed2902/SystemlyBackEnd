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
export type EmailRuntimeModel = "app_only" | "persistent_server";

// index.ts/app.ts are safe for serverless platforms by default. Only the
// long-lived server.ts entrypoint marks this process as capable of consuming
// Graphile Worker jobs.
let runtimeModel: EmailRuntimeModel = "app_only";

export function configureEmailRuntime(model: EmailRuntimeModel) {
  runtimeModel = model;
}

export function getEmailDeliveryMode(): EmailDeliveryMode {
  const configured = process.env.EMAIL_DELIVERY_MODE?.trim().toLowerCase();
  if (configured && configured !== "inline" && configured !== "worker") {
    throw new Error(
      'EMAIL_DELIVERY_MODE must be either "inline" or "worker"',
    );
  }

  if (runtimeModel === "app_only") {
    // An app-only/serverless entrypoint has no persistent Graphile consumer.
    // Never persist email jobs there, even if a stale deployment variable says
    // "worker"; doing so creates durable jobs that nobody can execute.
    return "inline";
  }

  return configured === "inline" ? "inline" : "worker";
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
 * Dispatch an email using the execution-model-appropriate delivery mode.
 *
 * Persistent servers may use Graphile Worker. App-only/serverless entrypoints
 * deliver inline through the same validated task/provider implementation.
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
      throw new Error("Delayed email jobs require a persistent worker runtime");
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
