export interface ApplicationErrorOptions {
  details?: unknown;
  expose?: boolean;
  cause?: unknown;
}

export class ApplicationError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    options: ApplicationErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ApplicationError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = options.details;
    this.expose = options.expose ?? statusCode < 500;
  }
}

function create(
  code: string,
  statusCode: number,
  message: string,
  options?: ApplicationErrorOptions,
) {
  return new ApplicationError(code, statusCode, message, options);
}

export const Errors = {
  badRequest: (message: string, code = "BAD_REQUEST", details?: unknown) =>
    create(code, 400, message, { details }),
  unauthorized: (message = "Authentication is required", code = "UNAUTHORIZED") =>
    create(code, 401, message),
  paymentRequired: (message: string, code = "PAYMENT_REQUIRED") =>
    create(code, 402, message),
  forbidden: (message = "You do not have access to this resource", code = "FORBIDDEN") =>
    create(code, 403, message),
  notFound: (message = "The requested resource was not found", code = "NOT_FOUND") =>
    create(code, 404, message),
  conflict: (message: string, code = "CONFLICT", details?: unknown) =>
    create(code, 409, message, { details }),
  validation: (details: unknown, message = "Validation failed") =>
    create("VALIDATION_ERROR", 422, message, { details }),
  invalidState: (message: string, code = "INVALID_STATE") =>
    create(code, 409, message),
  serviceUnavailable: (
    message = "The service is temporarily unavailable",
    code = "SERVICE_UNAVAILABLE",
    cause?: unknown,
  ) => create(code, 503, message, { cause, expose: true }),
  internal: (message = "An unexpected server error occurred", cause?: unknown) =>
    create("INTERNAL_ERROR", 500, message, { cause, expose: false }),
} as const;

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}
