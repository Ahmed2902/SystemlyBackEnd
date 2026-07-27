import "../shared/config/env";
import { sendEmailTask } from "../workers/email.worker";

async function main() {
  const to = process.argv[2] || process.env.EMAIL_TEST_TO;
  if (!to) {
    throw new Error(
      "Provide a recipient: npm run email:worker:test -- you@example.com or set EMAIL_TEST_TO",
    );
  }

  const idempotencyKey = `worker-smoke:${Date.now()}`;
  const result = await sendEmailTask(
    {
      type: "smoke_test",
      to,
      idempotencyKey,
      data: {
        subject: "Hgezli worker email test",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h1>The Hgezli email task works</h1>
            <p>The same task function used by Graphile Worker delivered this message.</p>
            <p>Smoke key: <code>${idempotencyKey}</code></p>
          </div>
        `,
      },
    },
    {},
  );

  console.log("[EmailWorkerTest] Completed", result);
}

main().catch((error) => {
  console.error("[EmailWorkerTest] Failed", error);
  process.exitCode = 1;
});
