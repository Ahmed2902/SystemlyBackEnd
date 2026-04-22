import "./../../src/shared/config/env";
import { sendWelcomeEmail } from "../shared/services/email.service";

const run = async () => {
  const to = process.env.EMAIL_TEST_RECIPIENT;
  if (!to) {
    console.error("EMAIL_TEST_RECIPIENT not set in environment");
    process.exit(1);
  }

  const res = await sendWelcomeEmail({ name: "Test", email: to });
  if (res.sent) {
    console.log("Test email sent", res.data);
    process.exit(0);
  }
  console.error("Failed to send test email", res.error);
  process.exit(1);
};

void run();
