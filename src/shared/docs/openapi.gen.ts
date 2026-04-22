import type { Application, RequestHandler } from "express";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { authSchemas } from "../../modules/auth/auth.schema";
import { businessSchemas } from "../../modules/business/business.schema";
import { websiteContentSchemas } from "../../modules/website-content/website-content.schema";
import { staffSchemas } from "../../modules/staff/staff.schema";
import { servicesSchemas } from "../../modules/services/services.schema";
import { customersSchemas } from "../../modules/customers/customers.schema";
import { faqsSchemas } from "../../modules/faqs/faqs.schema";
import { bookingsSchemas } from "../../modules/bookings/bookings.schema";
import { appointmentsSchemas } from "../../modules/appointments/appointments.schema";
import { billingSchemas } from "../../modules/billing/billing.schema";
import { photosSchemas } from "../../modules/photos/photos.schema";

extendZodWithOpenApi(z);

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

type ValidationTarget = "body" | "query" | "params";

type SchemaTaggedHandler = RequestHandler & {
  __validationTarget?: ValidationTarget;
  __validationSchema?: z.ZodTypeAny;
};

type Endpoint = {
  path: string;
  method: "get" | "post" | "put" | "patch" | "delete";
  schemas: Partial<Record<ValidationTarget, z.ZodTypeAny>>;
};

const pathFromRegexp = (regexp: RegExp | undefined) => {
  if (!regexp || !regexp.source) return "";
  const src = regexp.source;

  const literalSegs = Array.from(src.matchAll(/\\\/([^\\\/\(\^\$\?]+)/g)).map(
    (match) => `/${match[1]}`
  );

  const paramSegs = Array.from(
    src.matchAll(
      /\\\/\(\?:\(\[\^\\\/\]\+\?\)\)|\\\/\(\[\^\\\/\]\+\?\)|\\\/\(\[\^\\\/\]\+\)/g
    )
  ).map(() => "/:param");

  return [...literalSegs, ...paramSegs].join("");
};

const collectEndpoints = (app: Application): Endpoint[] => {
  const endpoints: Endpoint[] = [];
  const asAny = app as any;
  const stack: unknown[] = (asAny.router?.stack ?? asAny._router?.stack) ?? [];

  const traverse = (layers: unknown[], prefix = "") => {
    for (const layer of layers) {
      const current = layer as {
        route?: {
          path: string | string[];
          methods: Record<string, boolean>;
          stack: Array<{ handle: RequestHandler }>;
        };
        name?: string;
        handle?: { stack?: unknown[] };
        regexp?: RegExp;
      };

      if (current.route) {
        const routePaths = Array.isArray(current.route.path)
          ? current.route.path
          : [current.route.path];

        const schemas: Partial<Record<ValidationTarget, z.ZodTypeAny>> = {};
        for (const middleware of current.route.stack ?? []) {
          const tagged = middleware.handle as SchemaTaggedHandler;
          if (tagged.__validationTarget && tagged.__validationSchema) {
            schemas[tagged.__validationTarget] = tagged.__validationSchema;
          }
        }

        const methods = Object.keys(current.route.methods || {}).filter(
          (method) => current.route?.methods?.[method]
        );

        for (const routePath of routePaths) {
          for (const method of methods) {
            const normalizedMethod = method.toLowerCase() as Endpoint["method"];
            if (!["get", "post", "put", "patch", "delete"].includes(normalizedMethod)) {
              continue;
            }
            endpoints.push({
              path: `${prefix}${routePath}`,
              method: normalizedMethod,
              schemas,
            });
          }
        }
        continue;
      }

      if (
        current.name === "router" &&
        current.handle &&
        Array.isArray(current.handle.stack)
      ) {
        traverse(current.handle.stack, `${prefix}${pathFromRegexp(current.regexp)}`);
        continue;
      }

      if (Array.isArray(current.handle?.stack)) {
        traverse(current.handle.stack, prefix);
      }
    }
  };

  traverse(stack);

  return endpoints;
};

const toOpenApiPath = (path: string) => path.replace(/:([^\/]+)/g, "{$1}");

const getTagFromPath = (path: string) => {
  const segment = path.split("/").filter(Boolean)[1] ?? "core";
  return segment;
};

const moduleSchemas = {
  auth: authSchemas,
  business: businessSchemas,
  websiteContent: websiteContentSchemas,
  staff: staffSchemas,
  services: servicesSchemas,
  customers: customersSchemas,
  faqs: faqsSchemas,
  bookings: bookingsSchemas,
  appointments: appointmentsSchemas,
  billing: billingSchemas,
  photos: photosSchemas,
} as const;

export const getOpenApiDocument = (
  app: Application,
  info: {
    title: string;
    version: string;
    url?: string;
  }
) => {
  const registry = new OpenAPIRegistry();

  registry.register("SuccessEnvelope", successEnvelopeSchema);
  registry.register("ErrorEnvelope", errorEnvelopeSchema);
  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
  });
  void moduleSchemas;

  const dedupe = new Set<string>();
  const endpoints = collectEndpoints(app);

  for (const endpoint of endpoints) {
    const openApiPath = toOpenApiPath(endpoint.path);
    const dedupeKey = `${endpoint.method}:${openApiPath}`;

    if (dedupe.has(dedupeKey)) continue;
    if (openApiPath.startsWith("/docs") || openApiPath === "/metrics") continue;

    dedupe.add(dedupeKey);

    const request: Record<string, unknown> = {};

    if (endpoint.schemas.body) {
      request.body = {
        content: {
          "application/json": {
            schema: endpoint.schemas.body,
          },
        },
      };
    }

    if (endpoint.schemas.query) {
      request.query = endpoint.schemas.query;
    }

    if (endpoint.schemas.params) {
      request.params = endpoint.schemas.params;
    }

    registry.registerPath({
      method: endpoint.method,
      path: openApiPath,
      tags: [getTagFromPath(openApiPath)],
      request,
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: successEnvelopeSchema,
            },
          },
        },
        400: {
          description: "Bad request",
          content: {
            "application/json": {
              schema: errorEnvelopeSchema,
            },
          },
        },
      },
      security: [{ bearerAuth: [] }],
    });
  }

  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.3",
    info: {
      title: info.title,
      version: info.version,
    },
    servers: info.url ? [{ url: info.url }] : undefined,
  });
};

export const getSwaggerHtml = () => `<!DOCTYPE html>
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
        url: "/docs/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true,
        persistAuthorization: true
      });
    </script>
  </body>
</html>`;
