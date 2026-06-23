import "./../../src/shared/config/env";
import { enqueueWelcomeEmail } from "../shared/services/email.service";

const run = async () => {
  const to = process.env.EMAIL_TEST_RECIPIENT;
  if (!to) {
    console.error("EMAIL_TEST_RECIPIENT not set in environment");
    process.exit(1);
  }

  try {
    await enqueueWelcomeEmail({ name: "Test", email: to });
    console.log("Enqueued test welcome email");
    process.exit(0);
  } catch (err) {
    console.error("Failed to enqueue test email", err);
    process.exit(1);
  }
};

void run();
