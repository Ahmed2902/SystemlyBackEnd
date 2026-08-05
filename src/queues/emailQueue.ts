import crypto from "node:crypto";
import { getWorkerUtils } from "./queue";
import { emailJobSchema, type EmailJob } from "../workers/email-job.schema";

export interface EmailJobOptions {
  attempts?: number;
  delayMs?: number;
  idempotencyKey?: string;
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

/** Persist an email job before the HTTP request is acknowledged. */
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
  await getWorkerUtils();
}
