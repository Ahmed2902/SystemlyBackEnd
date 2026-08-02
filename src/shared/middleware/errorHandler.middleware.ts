import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

type AppError = Error & {
  code?: string;
  details?: unknown;
  fieldErrors?: Record<string, string>;
  statusCode?: number;
};

const isPrismaKnownRequestError = (
  error: unknown,
): error is { code: string; message: string } => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    error.constructor?.name === "PrismaClientKnownRequestError"
  );
};

const getPrismaErrorResponse = (error: { code: string }) => {
  switch (error.code) {
    case "P2002":
      return {
        code: "UNIQUE_CONSTRAINT",
        message: "A record with the same unique field already exists.",
        statusCode: 409,
      };
    case "P2025":
      return {
        code: "NOT_FOUND",
        message: "The requested record was not found.",
        statusCode: 404,
      };
    default:
      return {
        code: "DATABASE_ERROR",
        message: "A database error occurred.",
        statusCode: 400,
      };
  }
};

export const errorHandler = (
  error: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (process.env.NODE_ENV !== "test") {
    console.error(error);
  }

  if (error instanceof ZodError) {
    const flattened = error.flatten();
    res.status(422).json({
      ok: false,
      success: false,
      fieldErrors: flattened.fieldErrors,
      message: "Validation failed",
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: flattened,
    });
    return;
  }

  if (isPrismaKnownRequestError(error)) {
    const prismaError = getPrismaErrorResponse(error);

    res.status(prismaError.statusCode).json({
      ok: false,
      success: false,
      message: prismaError.message,
      error: prismaError.message,
      code: prismaError.code,
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      ok: false,
      success: false,
      message: "Invalid JSON payload.",
      error: "Invalid JSON payload.",
      code: "INVALID_JSON",
    });
    return;
  }

  if (error.code === "PUBLIC_SITE_UNAVAILABLE") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "3600");
  }

  res.status(Number(error.statusCode) || 500).json({
    ok: false,
    success: false,
    message: error.message || "Internal server error",
    error: error.message || "Internal server error",
    code: error.code || "INTERNAL_ERROR",
    ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    ...(process.env.NODE_ENV === "development"
      ? { details: error.details || error.stack }
      : {}),
  });
};
