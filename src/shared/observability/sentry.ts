import * as SentrySdk from "@sentry/node";
import { SENTRY } from "../config/config";

export type SentryComponent = "api" | "worker" | "worker-once";

let initialized = false;

export function initializeSentry(component: SentryComponent): boolean {
  if (initialized || !SENTRY.ENABLED) return initialized;

  SentrySdk.init({
    dsn: SENTRY.DSN,
    environment: SENTRY.ENV,
    release: SENTRY.RELEASE,
    tracesSampleRate: SENTRY.TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });

  SentrySdk.setTag("component", component);
  initialized = true;
  return true;
}

export function shouldCaptureHttpError(statusCode: number): boolean {
  return statusCode >= 500;
}

export function captureException(
  error: unknown,
  component: SentryComponent,
  tags: Record<string, string> = {},
): string | undefined {
  if (!SENTRY.ENABLED) return undefined;

  return SentrySdk.withScope((scope) => {
    scope.setTag("component", component);
    for (const [key, value] of Object.entries(tags)) {
      scope.setTag(key, value);
    }
    return SentrySdk.captureException(error);
  });
}

export async function flushSentry(timeoutMs = 2_000): Promise<boolean> {
  if (!SENTRY.ENABLED) return true;
  return SentrySdk.flush(timeoutMs);
}
