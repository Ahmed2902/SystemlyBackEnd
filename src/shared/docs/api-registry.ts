import { z } from "zod";

/**
 * Metadata for a single API endpoint.
 * Keeps OpenAPI documentation separate from Express route registration
 * while reusing the exact same Zod schemas used for validation.
 */
export interface EndpointDefinition {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** Full path including any prefix, e.g. /api/appointments/:id */
  path: string;
  summary?: string;
  description?: string;
  /** OpenAPI tags for grouping */
  tags?: string[];
  /** Whether the endpoint requires authentication (defaults to true) */
  security?: boolean;
  /** The Zod schema used for request body validation */
  requestBody?: z.ZodType;
  /** The Zod schema used for query parameter validation */
  queryParams?: z.ZodType;
  /** The Zod schema used for path parameter validation */
  pathParams?: z.ZodType;
  /** Response schemas keyed by HTTP status code */
  responses?: Record<
    number,
    {
      description: string;
      schema?: z.ZodType;
    }
  >;
}

/**
 * Global API endpoint registry.
 *
 * Route files call `apiRegistry.register()` to declare their endpoints
 * and their OpenAPI metadata. The generator reads this registry to
 * produce the final OpenAPI document.
 */
class ApiEndpointRegistry {
  private endpoints: EndpointDefinition[] = [];

  register(def: EndpointDefinition): void {
    this.endpoints.push(def);
  }

  getAll(): EndpointDefinition[] {
    return [...this.endpoints];
  }

  clear(): void {
    this.endpoints.length = 0;
  }
}

export const apiRegistry = new ApiEndpointRegistry();

/**
 * Convenience helper to build common response maps.
 */
export const commonResponses = {
  success: (schema?: z.ZodType) => ({
    200: {
      description: "Successful response",
      schema,
    },
  }),
  created: (schema?: z.ZodType) => ({
    201: {
      description: "Resource created",
      schema,
    },
  }),
  noContent: () => ({
    204: {
      description: "No content",
    },
  }),
  badRequest: () => ({
    400: {
      description: "Validation error",
    },
  }),
  unauthorized: () => ({
    401: {
      description: "Unauthorized",
    },
  }),
  forbidden: () => ({
    403: {
      description: "Forbidden",
    },
  }),
  notFound: () => ({
    404: {
      description: "Resource not found",
    },
  }),
};
