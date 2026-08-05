import * as SentrySdk from "@sentry/node";
import { SENTRY } from "../config/config";

export type SentryComponent =
  | "api"
  | "email-worker"
  | "sentry-verifier";

let initialized = false;

export function isSentryConfigured(): boolean {
  return Boolean(SENTRY.DSN) && process.env.NODE_ENV !== "test";
}

function resolveTraceSampleRate(): number {
  const parsed = Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(1, Math.max(0, parsed));
}

export function initializeSentry(component: SentryComponent): boolean {
  if (initialized || !isSentryConfigured()) return initialized;

  SentrySdk.init({
    dsn: SENTRY.DSN,
    environment: SENTRY.ENV,
    release: SENTRY.RELEASE,
    tracesSampleRate: resolveTraceSampleRate(),
    debug: process.env.SENTRY_DEBUG === "true",
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.Authorization;
          delete event.request.headers.cookie;
          delete event.request.headers.Cookie;
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
  if (!isSentryConfigured()) return undefined;

  return SentrySdk.withScope((scope) => {
    scope.setTag("component", component);
    for (const [key, value] of Object.entries(tags)) {
      scope.setTag(key, value);
    }
    return SentrySdk.captureException(error);
  });
}

export async function flushSentry(timeoutMs = 2_000): Promise<boolean> {
  if (!isSentryConfigured()) return true;
  return SentrySdk.flush(timeoutMs);
}

export function resetSentryForTests() {
  initialized = false;
}
