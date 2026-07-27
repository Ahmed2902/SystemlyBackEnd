import "../shared/config/env";
import { getConfiguredEmailProvider, sendTransactionalEmail } from "../shared/email/email.provider";

async function main() {
  const to = process.argv[2] || process.env.EMAIL_TEST_TO;
  if (!to) {
    throw new Error(
      "Provide a recipient: npm run email:test -- you@example.com or set EMAIL_TEST_TO",
    );
  }

  const provider = getConfiguredEmailProvider();
  const result = await sendTransactionalEmail({
    to,
    subject: "Hgezli transactional email test",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6">
        <h1>Hgezli email is working</h1>
        <p>This message was sent directly through <strong>${provider}</strong>.</p>
        <p>Next, run the queued worker smoke test to verify Graphile Worker delivery.</p>
      </div>
    `,
  });

  console.log("[EmailTest] Provider accepted message", result);
}

main().catch((error) => {
  console.error("[EmailTest] Failed", error);
  process.exitCode = 1;
});
