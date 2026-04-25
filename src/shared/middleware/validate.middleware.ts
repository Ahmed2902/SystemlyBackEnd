import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";
import type { NextFunction, Request, Response } from "express";
import type { ZodAny, ZodTypeAny } from "zod";

type ValidationTarget = "body" | "query" | "params";

type SchemaTaggedHandler = RequestHandler & {
  __validationTarget?: ValidationTarget;
  __validationSchema?: ZodTypeAny;
};

const withSchemaMetadata = (
  handler: RequestHandler,
  target: ValidationTarget,
  schema: ZodTypeAny
): RequestHandler => {
  const tagged = handler as SchemaTaggedHandler;
  tagged.__validationTarget = target;
  tagged.__validationSchema = schema;
  return tagged;
};
export const validateBody = (schema: ZodSchema): RequestHandler =>
  withSchemaMetadata(
    (req, _res, next) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      req.body = parsed.data;
      return next();
    },
    "body",
    schema as ZodTypeAny
  );

export const validateQuery = (schema: ZodSchema): RequestHandler =>
  withSchemaMetadata(
    (req, _res, next) => {
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      //req.query = parsed.data as any;
      return next();
    },
    "query",
    schema as ZodTypeAny
  );

export const validateParams = (schema: ZodSchema): RequestHandler =>
  withSchemaMetadata(
    (req, _res, next) => {
      const parsed = schema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      req.params = parsed.data as any;
      return next();
    },
    "params",
    schema as ZodTypeAny
  );

export const validate = (schemas: {
  body?: ZodAny;
  query?: ZodAny;
  params?: ZodAny;
}) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as any;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
};

export default { validateBody, validateQuery, validateParams };
