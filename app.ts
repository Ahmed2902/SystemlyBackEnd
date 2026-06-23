import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application, raw } from "express";
import helmet from "helmet";
import routes from "./src/routes";
import { APP_CONFIG } from "./src/shared/config/config";
import {
  getOpenApiDocument,
  getSwaggerHtml,
} from "./src/shared/docs/openapi.gen";
import { notFoundHandler } from "./src/shared/middleware/notFound.middleware";
import { errorHandler } from "./src/shared/middleware/errorHandler.middleware";
import { globalRateLimit } from "./src/shared/middleware/rateLimit.middleware";
import * as promClient from "prom-client";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./src/shared/config/swagger.js";

const app: Application = express();

// Paymob webhook: must capture raw bytes for HMAC verification.
// Register this route BEFORE the app-wide JSON/body parsers so the
// billing controller can compute HMAC against the original bytes.
// Dynamically import the billing controller to avoid module load order issues.
// The billing controller's `webhook` method expects (req,res,next).
// Route is mounted at the full API path used by routes: /api/billing/webhook
// (routes later mount billing routes at /api/billing).
// This ensures compatibility with deployed webhook signer expectations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const billingController = require("./src/modules/billing/billing.controller").default;

app.post(
  "/api/billing/webhook",
  raw({ type: "application/json" }),
  (req, res, next) => billingController.webhook(req, res, next),
);

const allowedOrigins = APP_CONFIG.corsOrigins;

const corsOptions = {
  credentials: true,
  origin(
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) {
    if (
      !origin ||
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin)
    ) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS"));
  },
};

app.set("trust proxy", 1);

app.disable("x-powered-by");

app.use(helmet());
app.use(cors(corsOptions));
app.use(globalRateLimit);
app.use(express.json({ limit: APP_CONFIG.jsonBodyLimit }));
app.use(
  express.urlencoded({ extended: true, limit: APP_CONFIG.formBodyLimit })
);
app.use(cookieParser());

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    data: {
      name: "Hgezli API",
      env: process.env.NODE_ENV || "development",
      status: "ok",
    },
  });
});
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/docs/openapi.json", (_req, res) => {
  const doc = getOpenApiDocument(app, {
    title: "Hgezli API",
    version: "1.0.0",
    url: process.env.APP_URL,
  });
  res.status(200).json(doc);
});

app.get("/docs", (_req, res) => {
  // Keep the simple static UI for environments where CDN is preferred
  res.type("html").send(getSwaggerHtml());
});

// Prometheus metrics endpoint
promClient.collectDefaultMetrics();
app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", promClient.register.contentType);
  res.send(await promClient.register.metrics());
});

app.use("/api", routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
