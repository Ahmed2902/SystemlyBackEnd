import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

type AppError = Error & {
  code?: string;
  details?: unknown;
  statusCode?: number;
};

const isPrismaKnownRequestError = (
  error: unknown
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
  _next: NextFunction
) => {
  if (process.env.NODE_ENV !== "test") {
    console.error(error);
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: error.flatten(),
    });
    return;
  }

  if (isPrismaKnownRequestError(error)) {
    const prismaError = getPrismaErrorResponse(error);

    res.status(prismaError.statusCode).json({
      success: false,
      error: prismaError.message,
      code: prismaError.code,
    });
    return;
  }

  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      success: false,
      error: "Invalid JSON payload.",
      code: "INVALID_JSON",
    });
    return;
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || "Internal server error",
    code: error.code || "INTERNAL_ERROR",
    ...(process.env.NODE_ENV === "development" ? { details: error.details || error.stack } : {}),
  });
};
