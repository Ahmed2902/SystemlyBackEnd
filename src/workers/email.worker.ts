import crypto from "node:crypto";
import {
  normalizeEmailLocale,
  passwordResetEmailContent,
  staffInviteEmailContent,
  verificationEmailContent,
  welcomeEmailContent,
} from "../shared/utils/localized-email.templates";
import { emailJobSchema, type EmailJob } from "./email-job.schema";
import {
  ResendEmailProvider,
  type EmailProvider,
} from "./resend-email.provider";

let provider: EmailProvider | null = null;

function getEmailProvider(): EmailProvider {
  provider ??= new ResendEmailProvider();
  return provider;
}

function deriveIdempotencyKey(job: EmailJob): string {
  if (job.idempotencyKey) return job.idempotencyKey;

  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(job))
    .digest("hex");
  return `systemly-email-${hash}`;
}

function renderEmail(job: EmailJob): { subject: string; html: string } {
  const locale = normalizeEmailLocale(job.data.locale);

  switch (job.type) {
    case "verification":
      return verificationEmailContent({
        locale,
        name: job.data.name,
        verificationUrl: job.data.verificationUrl,
      });
    case "welcome":
      return welcomeEmailContent({
        locale,
        name: job.data.name,
        dashboardUrl: job.data.dashboardUrl,
      });
    case "password_reset":
      return passwordResetEmailContent({
        locale,
        name: job.data.name,
        resetUrl: job.data.resetUrl,
      });
    case "staff_invite":
      return staffInviteEmailContent({
        locale,
        inviterName: job.data.inviterName,
        businessName: job.data.businessName,
        acceptUrl: job.data.acceptUrl,
      });
  }
}

/**
 * Graphile Worker handler for durable authentication and staff-invitation
 * emails. The runtime schema is intentionally checked at the queue boundary
 * and again here because persisted JSON is an untrusted input boundary.
 */
export async function sendEmailTask(payload: unknown): Promise<void> {
  const job = emailJobSchema.parse(payload);
  const content = renderEmail(job);

  await getEmailProvider().send({
    to: job.to,
    subject: content.subject,
    html: content.html,
    idempotencyKey: deriveIdempotencyKey(job),
  });

  console.info(
    JSON.stringify({
      event: "email_sent",
      emailType: job.type,
    }),
  );
}

export default sendEmailTask;
