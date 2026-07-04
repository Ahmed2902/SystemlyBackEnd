import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
  type ResponseConfig,
  type ZodRequestBody,
} from "@asteasolutions/zod-to-openapi";
import type { Application, RequestHandler } from "express";
import { z } from "zod";
import type { DocMetadata } from "../middleware/doc.middleware";

// ──────────────────────────────────────────────
// Shared / reusable OpenAPI components
// ──────────────────────────────────────────────

const successEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
});

const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
});

function responseConfig(
  description: string,
  schema?: z.ZodType,
): ResponseConfig {
  if (!schema) {
    return { description };
  }
  return {
    description,
    content: {
      "application/json": { schema },
    },
  };
}

const DEFAULT_RESPONSES: Record<string, ResponseConfig> = {
  400: responseConfig("Bad request – validation error", errorEnvelopeSchema),
  401: responseConfig(
    "Unauthorized – missing or invalid token",
    errorEnvelopeSchema,
  ),
  403: responseConfig(
    "Forbidden – insufficient permissions",
    errorEnvelopeSchema,
  ),
  404: responseConfig("Not found", errorEnvelopeSchema),
  500: responseConfig("Internal server error", errorEnvelopeSchema),
};

// ──────────────────────────────────────────────
// Types used for internal middleware tagging
// ──────────────────────────────────────────────

type ValidationTarget = "body" | "query" | "params";

type SchemaTaggedHandler = RequestHandler & {
  __validationTarget?: ValidationTarget;
  __validationSchema?: z.ZodType;
};

type DocTaggedHandler = RequestHandler & {
  __docMetadata?: DocMetadata;
};

type DiscoveredSchemas = Partial<Record<ValidationTarget, z.ZodType>>;

// ──────────────────────────────────────────────
// Express router stack walker
// ──────────────────────────────────────────────

type DiscoveredEndpoint = {
  path: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  schemas: DiscoveredSchemas;
  doc?: DocMetadata;
};

/**
 * Reconstruct a path segment from an Express route regexp.
 *
 * Example:
 *   /^\/appointments\/(?:([^\/]+?))\/?$/i  →  "/appointments/:param"
 *   /^\/api\/users\/?(?=\/|$)/i             →  "/api/users"
 */
const pathFromRegexp = (regexp: RegExp | undefined): string => {
  if (!regexp) return "";

  const src = regexp.source;

  // Extract literal segments that look like /something
  const literalSegments = Array.from(src.matchAll(/\\\/([^\\\/()?^$]+)/g)).map(
    (m) => `/${m[1]}`,
  );

  // Extract parameterized segments
  const paramMatches = Array.from(
    src.matchAll(
      /\\\/\(\?:\(\[\^\\\/\]\+\?\)\)|\\\/\(\[\^\\\/\]\+\?\)|\\\/\(\[\^\\\/\]\+\)/g,
    ),
  );

  // Match named params from Express 5 notation: (?<id>[^/]+?)
  const namedParams = Array.from(src.matchAll(/\(\?<(\w+)>[^)]+\)/g));

  if (namedParams.length > 0) {
    return namedParams
      .reduce((acc, match, index) => {
        if (index === 0) {
          // Find the literal prefix before the first named param
          const prefix = src.slice(0, match.index);
          const prefixClean = prefix.replace(/[\\^\/$]/g, "");
          return `/${prefixClean ? prefixClean : ":param"}/:${match[1]}`;
        }
        return `${acc}/:${match[1]}`;
      }, "")
      .replace(/\/+/g, "/");
  }

  const paramSegments = paramMatches.map(() => "/:param");
  const segments = [...literalSegments, ...paramSegments];

  // For simple patterns like \/users\/?$/i, produce /users
  if (literalSegments.length === 0 && paramSegments.length === 0) {
    const simple = src
      .replace(/\\\//g, "/")
      .replace(/\(\?=\/|\\$\)\?/g, "")
      .replace(/[^\/\w-]/g, "")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "");
    return simple;
  }

  return segments.join("").replace(/\/+/g, "/");
};

/**
 * Walk the Express application/router stack to discover all registered
 * routes, their HTTP methods, and associated Zod validation schemas.
 */
const collectEndpoints = (app: Application): DiscoveredEndpoint[] => {
  const endpoints: DiscoveredEndpoint[] = [];

  // Express exposes the internal router via _router or app.router
  const internalApp = app as unknown as {
    _router?: { stack: unknown[] };
    router?: { stack: unknown[] };
  };
  const topStack =
    internalApp._router?.stack ?? internalApp.router?.stack ?? [];

  const traverse = (layers: unknown[], prefix: string): void => {
    for (const layer of layers) {
      const l = layer as {
        route?: {
          path: string | string[];
          methods: Record<string, boolean>;
          stack: Array<{ handle: RequestHandler; name?: string }>;
        };
        name?: string;
        handle?: { stack?: unknown[] };
        regexp?: RegExp;
      };

      // --- Leaf route ---
      const route = l.route;
      if (route && route.methods) {
        const routePaths = Array.isArray(route.path)
          ? route.path
          : [route.path];

        const methods = Object.keys(route.methods).filter(
          (m) => route.methods[m],
        );

        for (const routePath of routePaths) {
          for (const rawMethod of methods) {
            const method =
              rawMethod.toLowerCase() as DiscoveredEndpoint["method"];
            if (!["get", "post", "put", "patch", "delete"].includes(method)) {
              continue;
            }

            const schemas: DiscoveredSchemas = {};
            let docMetadata: DocMetadata | undefined;

            // Walk the route's middleware stack to extract validation schemas and doc metadata
            for (const mw of route.stack) {
              const schemaHandler = mw.handle as SchemaTaggedHandler;
              if (
                schemaHandler.__validationTarget &&
                schemaHandler.__validationSchema
              ) {
                schemas[schemaHandler.__validationTarget] =
                  schemaHandler.__validationSchema;
              }

              const docHandler = mw.handle as DocTaggedHandler;
              if (docHandler.__docMetadata) {
                docMetadata = docHandler.__docMetadata;
              }
            }

            endpoints.push({
              path: `${prefix}${routePath}`,
              method,
              schemas,
              doc: docMetadata,
            });
          }
        }
        continue;
      }

      // --- Nested router (sub-router mounted via .use) ---
      if (l.name === "router" && l.handle && Array.isArray(l.handle.stack)) {
        traverse(l.handle.stack, `${prefix}${pathFromRegexp(l.regexp)}`);
        continue;
      }

      // --- Other nested middleware (e.g. rate-limit, auth) with stack ---
      if (Array.isArray(l.handle?.stack)) {
        traverse(l.handle.stack, prefix);
      }
    }
  };

  traverse(topStack, "");
  return endpoints;
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const toOpenApiPath = (path: string): string =>
  path.replace(/:([^/]+)/g, "{$1}");

/**
 * Convert a Zod schema into an OpenAPI request-body definition.
 */
const zodToRequestBody = (schema: z.ZodType) => ({
  required: true,
  content: {
    "application/json": { schema },
  },
});

/**
 * Register a Zod schema as a named component in the registry and return
 * a reference to it. This avoids the inline-parameter issue where
 * zod-to-openapi's internal registry can't resolve the schema chain.
 */
const registerSchemaComponent = (
  registry: OpenAPIRegistry,
  name: string,
  schema: z.ZodType,
): string => {
  registry.register(name, schema);
  return name;
};

/**
 * Build the OpenAPI responses map from doc metadata.
 */
const buildResponses = (
  docMeta?: DocMetadata,
): Record<string, ResponseConfig> => {
  const custom = docMeta?.responses;
  if (!custom || Object.keys(custom).length === 0) {
    return {
      ...DEFAULT_RESPONSES,
      200: responseConfig("Successful response", successEnvelopeSchema),
    };
  }

  const result: Record<string, ResponseConfig> = {};
  for (const [rawStatus, resp] of Object.entries(custom)) {
    const status = Number(rawStatus);
    if (status === 204) {
      result[status] = { description: resp.description };
    } else if (resp.schema) {
      // Wrap in success envelope
      const wrapped = successEnvelopeSchema.extend({
        data: resp.schema,
      });
      result[status] = responseConfig(resp.description, wrapped);
    } else {
      result[status] = responseConfig(resp.description, successEnvelopeSchema);
    }
  }
  return { ...DEFAULT_RESPONSES, ...result };
};

/**
 * Derive default tags from the path prefix.
 */
const deriveTags = (path: string): string[] => {
  const segments = path.split("/").filter(Boolean);
  return [segments[0] ?? "core"];
};

// ──────────────────────────────────────────────
// Main generator
// ──────────────────────────────────────────────

export const getOpenApiDocument = (
  app: Application,
  info: {
    title: string;
    version: string;
    url?: string;
  },
) => {
  const registry = new OpenAPIRegistry();

  // Register shared components
  registry.register("SuccessEnvelope", successEnvelopeSchema);
  registry.register("ErrorEnvelope", errorEnvelopeSchema);
  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  });

  const dedupe = new Set<string>();
  const endpoints = collectEndpoints(app);

  for (const ep of endpoints) {
    const openApiPath = toOpenApiPath(ep.path);
    const dedupeKey = `${ep.method}:${openApiPath}`;
    if (dedupe.has(dedupeKey)) continue;

    // Skip internal routes
    if (
      openApiPath.startsWith("/docs") ||
      openApiPath.startsWith("/metrics") ||
      openApiPath.startsWith("/api-docs") ||
      openApiPath.startsWith("/openapi.json")
    ) {
      continue;
    }

    dedupe.add(dedupeKey);

    const tags = ep.doc?.tags ?? deriveTags(openApiPath);
    const security = ep.doc?.security !== false ? [{ bearerAuth: [] }] : [];

    const request: {
      body?: ZodRequestBody;
      query?: z.ZodObject<any, any>;
      params?: z.ZodObject<any, any>;
    } = {};
    if (ep.schemas.body) {
      request.body = zodToRequestBody(ep.schemas.body);
    }
    if (ep.schemas.query) {
      request.query = ep.schemas.query as z.ZodObject<any, any>;
    }
    if (ep.schemas.params) {
      request.params = ep.schemas.params as z.ZodObject<any, any>;
    }

    registry.registerPath({
      method: ep.method,
      path: openApiPath,
      summary: ep.doc?.summary,
      description: ep.doc?.description,
      tags,
      request,
      responses: buildResponses(ep.doc),
      security,
    });
  }

  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: info.title,
      version: info.version,
    },
    servers: info.url ? [{ url: info.url }] : [],
  });
};

// ──────────────────────────────────────────────
// Swagger UI HTML
// ──────────────────────────────────────────────

export const getSwaggerHtml = (specUrl = "/openapi.json") =>
  `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Hgezli API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
      });
    </script>
  </body>
</html>`;
