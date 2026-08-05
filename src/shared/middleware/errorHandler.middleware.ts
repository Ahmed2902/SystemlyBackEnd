import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  ApplicationError,
  isApplicationError,
} from "../errors/application-error";
import logger from "../observability/logger";
import {
  captureException,
  shouldCaptureHttpError,
} from "../observability/sentry";

type LegacyApplicationError = Error & {
  code?: string;
  details?: unknown;
  fieldErrors?: Record<string, string>;
  statusCode?: number;
};

interface ErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

function isPrismaKnownRequestError(
  error: unknown,
): error is { code: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    error.constructor?.name === "PrismaClientKnownRequestError"
  );
}

function mapPrismaError(error: { code: string }): ErrorResponse {
  switch (error.code) {
    case "P2002":
      return {
        code: "UNIQUE_CONSTRAINT",
        message: "A record with the same unique value already exists.",
        statusCode: 409,
      };
    case "P2025":
      return {
        code: "NOT_FOUND",
        message: "The requested record was not found.",
        statusCode: 404,
      };
    case "P2034":
      return {
        code: "TRANSACTION_CONFLICT",
        message: "The operation conflicted with another request. Please retry.",
        statusCode: 409,
      };
    default:
      return {
        code: "DATABASE_ERROR",
        message: "An unexpected database error occurred.",
        statusCode: 500,
      };
  }
}

function normalizeError(error: unknown): ErrorResponse {
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "Validation failed.",
      statusCode: 422,
      details: error.flatten(),
    };
  }

  if (isPrismaKnownRequestError(error)) return mapPrismaError(error);

  if (error instanceof SyntaxError && "body" in error) {
    return {
      code: "INVALID_JSON",
      message: "Invalid JSON payload.",
      statusCode: 400,
    };
  }

  if (isApplicationError(error)) {
    return {
      code: error.code,
      message:
        error.expose || process.env.NODE_ENV !== "production"
          ? error.message
          : "An unexpected server error occurred.",
      statusCode: error.statusCode,
      details: error.details,
    };
  }

  const legacy = error as LegacyApplicationError;
  const statusCode = Number(legacy?.statusCode) || 500;
  return {
    code: legacy?.code || "INTERNAL_ERROR",
    message:
      statusCode < 500 || process.env.NODE_ENV !== "production"
        ? legacy?.message || "An unexpected server error occurred."
        : "An unexpected server error occurred.",
    statusCode,
    details: legacy?.details,
  };
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const normalized = normalizeError(error);
  const requestId = req.requestId || null;

  logger.error("request_failed", {
    requestId,
    method: req.method,
    path: req.route?.path || req.path,
    statusCode: normalized.statusCode,
    errorCode: normalized.code,
    errorName: error instanceof Error ? error.name : typeof error,
  });

  if (normalized.code === "PUBLIC_SITE_UNAVAILABLE") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "3600");
  }

  if (shouldCaptureHttpError(normalized.statusCode)) {
    captureException(error, "api", {
      error_code: normalized.code,
      http_method: req.method,
      http_route: req.route?.path || req.path,
      http_status: String(normalized.statusCode),
      request_id: requestId || "missing",
    });
  }

  const legacy = error as LegacyApplicationError;
  return res.status(normalized.statusCode).json({
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      requestId,
      ...(legacy.fieldErrors ? { fieldErrors: legacy.fieldErrors } : {}),
      ...(normalized.details && normalized.statusCode < 500
        ? { details: normalized.details }
        : {}),
      ...(process.env.NODE_ENV === "development" && error instanceof Error
        ? { stack: error.stack }
        : {}),
    },
  });
}

export { ApplicationError };
