import { z } from "zod";
import { closeWorkerUtils, enqueueJob } from "../queues/queue";

const recipientSchema = z.string().email();

async function main() {
  const recipient = recipientSchema.parse(process.argv[2]);
  if (process.env.NODE_ENV !== "production") {
    throw new Error(
      "Email-worker verification must run with NODE_ENV=production so it cannot pass through the test queue.",
    );
  }

  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) throw new Error("FRONTEND_URL is required");

  const idempotencyKey = `ops-email-verification:${Date.now()}`;
  const job = await enqueueJob(
    "send_email",
    {
      type: "welcome",
      to: recipient,
      idempotencyKey,
      data: {
        name: "Systemly operator",
        dashboardUrl: frontendUrl,
        locale: "en",
      },
    },
    { jobKey: idempotencyKey },
  );

  console.info(
    JSON.stringify({
      event: "email_worker_verification_enqueued",
      jobId: job.id,
      recipient,
      idempotencyKey,
      nextStep:
        "Confirm the message arrives and the API logs an email_sent event for type=welcome.",
    }),
  );
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        event: "email_worker_verification_failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeWorkerUtils().catch(() => undefined);
  });
