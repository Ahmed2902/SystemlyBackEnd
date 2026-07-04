import type { RequestHandler } from "express";
import type { z } from "zod";

export type ResponseMap = Record<
  number,
  {
    description: string;
    schema?: z.ZodType;
  }
>;

export type DocMetadata = {
  summary?: string;
  description?: string;
  tags?: string[];
  /** Whether the endpoint requires authentication – defaults to true */
  security?: boolean;
  /** Response schemas keyed by HTTP status code */
  responses?: ResponseMap;
};

type DocTaggedHandler = RequestHandler & {
  __docMetadata?: DocMetadata;
};

/**
 * Attach OpenAPI documentation metadata to a route handler.
 *
 * Usage in route files:
 *
 * ```ts
 * router.get(
 *   "/",
 *   requireAuth,
 *   doc({ summary: "List all appointments", tags: ["appointments"] }),
 *   validate.validateQuery(listAppointmentsQuerySchema),
 *   controller.list,
 * );
 * ```
 *
 * The metadata is read at spec-generation time by openapi.gen.ts
 * so that validation schemas and doc annotations stay as middleware.
 */
export const doc = (metadata: DocMetadata): RequestHandler => {
  const tagged = ((_req, _res, next) => {
    next();
  }) as DocTaggedHandler;
  tagged.__docMetadata = metadata;
  return tagged;
};

export default doc;
