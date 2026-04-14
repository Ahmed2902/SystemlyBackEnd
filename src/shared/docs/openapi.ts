const appUrl = process.env.APP_URL || "http://localhost:3000";

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Hgezli API",
    version: "1.0.0",
    description:
      "OpenAPI document for the currently wired Hgezli backend routes. Frontend teams can use this spec for integration and mock generation.",
  },
  servers: [
    {
      url: appUrl,
      description: "Current application base URL",
    },
  ],
  tags: [
    { name: "System", description: "Service health and metadata endpoints" },
    { name: "Auth", description: "Authentication and account flows" },
    { name: "Business", description: "Business-related public endpoints" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "object", additionalProperties: true },
        },
        required: ["success", "data"],
      },
      ErrorEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "string", example: "Unauthorized" },
          code: { type: "string", example: "UNAUTHORIZED" },
        },
        required: ["success", "error", "code"],
      },
      RegisterBody: {
        type: "object",
        required: ["name", "email", "password", "phone"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 100, example: "Sara Ali" },
          email: { type: "string", format: "email", example: "sara@example.com" },
          password: { type: "string", minLength: 8, maxLength: 100, example: "StrongPass123" },
          phone: {
            type: "string",
            pattern: "^(010|011|012|015)\\d{8}$",
            example: "01012345678",
          },
        },
      },
      LoginBody: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "sara@example.com" },
          password: { type: "string", example: "StrongPass123" },
        },
      },
      EmailBody: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email", example: "sara@example.com" },
        },
      },
      ResetPasswordBody: {
        type: "object",
        required: ["token", "password"],
        properties: {
          token: { type: "string", example: "email-or-reset-token" },
          password: { type: "string", minLength: 8, maxLength: 100, example: "NewStrongPass123" },
        },
      },
      RefreshTokenBody: {
        type: "object",
        properties: {
          refreshToken: {
            type: "string",
            description: "Optional when refresh token is already present in the httpOnly cookie.",
            example: "refresh-token-value",
          },
        },
      },
      UserSummary: {
        type: "object",
        properties: {
          id: { type: "string", example: "clx123" },
          name: { type: "string", example: "Sara Ali" },
          email: { type: "string", format: "email", example: "sara@example.com" },
          role: { type: "string", example: "BusinessAdmin" },
          businessId: { type: "string", nullable: true, example: "biz_123" },
        },
      },
    },
  },
  paths: {
    "/": {
      get: {
        tags: ["System"],
        summary: "Get API root metadata",
        responses: {
          "200": {
            description: "Service metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/businesses/check-slug/{slug}": {
      get: {
        tags: ["Business"],
        summary: "Check whether a business slug is available",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Requested business slug",
          },
        ],
        responses: {
          "200": {
            description: "Slug availability result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    available: { type: "boolean", example: true },
                    slug: { type: "string", example: "my-salon" },
                  },
                  required: ["available", "slug"],
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new account",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterBody" },
            },
          },
        },
        responses: {
          "201": {
            description: "Account created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/verify-email": {
      get: {
        tags: ["Auth"],
        summary: "Verify a user email using a token",
        parameters: [
          {
            name: "token",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Email verified and access token issued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/resend-verification": {
      post: {
        tags: ["Auth"],
        summary: "Resend the verification email",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EmailBody" },
            },
          },
        },
        responses: {
          "200": {
            description: "Verification email request accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Authenticate a user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginBody" },
            },
          },
        },
        responses: {
          "200": {
            description: "Login succeeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
          "401": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh the access token",
        description:
          "Accepts a refresh token in the request body or in the httpOnly refresh cookie.",
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshTokenBody" },
            },
          },
        },
        responses: {
          "200": {
            description: "Access token refreshed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
          "401": {
            description: "Missing or invalid refresh token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout the current session",
        responses: {
          "200": {
            description: "Logout succeeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset email",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EmailBody" },
            },
          },
        },
        responses: {
          "200": {
            description: "Password reset email request accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password with a token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ResetPasswordBody" },
            },
          },
        },
        responses: {
          "200": {
            description: "Password updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the current authenticated user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Authenticated user profile",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessEnvelope" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/UserSummary" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid bearer token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorEnvelope" },
              },
            },
          },
        },
      },
    },
  },
} as const;

export const getSwaggerHtml = () => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hgezli API Docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
    <style>
      body {
        margin: 0;
        background: #f5efe6;
      }
      .topbar {
        display: none;
      }
    </style>
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
        persistAuthorization: true,
      });
    </script>
  </body>
</html>`;
