import "../shared/config/env";
import {
  captureException,
  flushSentry,
  initializeSentry,
} from "../shared/observability/sentry";

export interface SentryVerificationResult {
  initialized: boolean;
  eventId: string;
  flushed: boolean;
}

export async function verifySentryDelivery(): Promise<SentryVerificationResult> {
  const initialized = initializeSentry("sentry-verifier");
  if (!initialized) {
    throw new Error(
      "Sentry is not initialized. Confirm SENTRY_DSN and NODE_ENV before retrying.",
    );
  }

  const eventId = captureException(
    new Error("Systemly controlled Sentry verification event"),
    "sentry-verifier",
    { verification: "true" },
  );
  if (!eventId) {
    throw new Error("Sentry did not return an event ID.");
  }

  const flushed = await flushSentry(5_000);
  if (!flushed) {
    throw new Error("Sentry did not flush the verification event in time.");
  }

  return { initialized, eventId, flushed };
}

async function main() {
  try {
    const result = await verifySentryDelivery();
    console.log(`Sentry initialized: ${result.initialized}`);
    console.log(`Event ID: ${result.eventId}`);
    console.log(`Flushed: ${result.flushed}`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Sentry verification failed.",
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}
