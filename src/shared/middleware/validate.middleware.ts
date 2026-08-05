import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";

type ValidationTarget = "body" | "query" | "params";

export interface ValidatedRequestParts {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

export type RequestWithValidation = Request & {
  validated?: ValidatedRequestParts;
};

type SchemaTaggedHandler = RequestHandler & {
  __validationTarget?: ValidationTarget;
  __validationSchema?: ZodTypeAny;
};

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function attachSchemaMetadata(
  handler: RequestHandler,
  target: ValidationTarget,
  schema: ZodTypeAny,
): RequestHandler {
  const tagged = handler as SchemaTaggedHandler;
  tagged.__validationTarget = target;
  tagged.__validationSchema = schema;
  return tagged;
}

export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    try {
      const req = request as RequestWithValidation;
      const validated: ValidatedRequestParts = {
        body: schemas.body ? schemas.body.parse(req.body) : req.body,
        query: schemas.query ? schemas.query.parse(req.query) : req.query,
        params: schemas.params ? schemas.params.parse(req.params) : req.params,
      };

      req.validated = validated;
      if (schemas.body) req.body = validated.body;
      if (schemas.params) req.params = validated.params as Request["params"];
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const validateBody = (schema: ZodTypeAny): RequestHandler =>
  attachSchemaMetadata(validateRequest({ body: schema }), "body", schema);

export const validateQuery = (schema: ZodTypeAny): RequestHandler =>
  attachSchemaMetadata(validateRequest({ query: schema }), "query", schema);

export const validateParams = (schema: ZodTypeAny): RequestHandler =>
  attachSchemaMetadata(validateRequest({ params: schema }), "params", schema);

/** Backward-compatible alias while routes migrate to validateRequest. */
export const validate = validateRequest;

export function validatedBody<T>(req: Request): T {
  return ((req as RequestWithValidation).validated?.body ?? req.body) as T;
}

export function validatedQuery<T>(req: Request): T {
  return ((req as RequestWithValidation).validated?.query ?? req.query) as T;
}

export function validatedParams<T>(req: Request): T {
  return ((req as RequestWithValidation).validated?.params ?? req.params) as T;
}

export default {
  validate,
  validateRequest,
  validateBody,
  validateQuery,
  validateParams,
  validatedBody,
  validatedQuery,
  validatedParams,
};
