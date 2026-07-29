// ⚠️ This MUST be imported first – extends Zod with .openapi() before
// any schema module is loaded
import "./src/shared/zod-setup";

import crypto from "node:crypto";
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
import { requestPerformanceMiddleware } from "./src/shared/middleware/requestPerformance.middleware";
import * as promClient from "prom-client";
const app: Application = express();

app.use(requestPerformanceMiddleware);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const billingController =
  require("./src/modules/billing/billing.controller").default;

app.post(
  "/api/billing/webhook",
  raw({ type: "application/json" }),
  (req, res, next) => billingController.webhook(req, res, next),
);

const allowedOrigins = APP_CONFIG.corsOrigins;
const allowAnyDevelopmentOrigin =
  process.env.NODE_ENV !== "production" && allowedOrigins.length === 0;

const corsOptions = {
  credentials: true,
  maxAge: 600,
  optionsSuccessStatus: 204,
  origin(
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) {
    if (
      !origin ||
      allowAnyDevelopmentOrigin ||
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
  express.urlencoded({ extended: true, limit: APP_CONFIG.formBodyLimit }),
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
// ── OpenAPI / Swagger documentation ──────────────────────────────────
// Raw JSON spec served at  /openapi.json
// Swagger UI served at    /docs

app.get("/openapi.json", (_req, res) => {
  const doc = getOpenApiDocument(app, {
    title: "Hgezli API",
    version: "1.0.0",
    url: process.env.APP_URL,
  });
  res.status(200).json(doc);
});

app.get("/docs", (_req, res) => {
  res.type("html").send(getSwaggerHtml("/openapi.json"));
});

function validMetricsToken(authorization: string | undefined) {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";

  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

// Process metrics expose operational details. In production this endpoint is
// hidden unless a token is configured, then protected with constant-time auth.
promClient.collectDefaultMetrics();
app.get("/metrics", async (req, res) => {
  if (!validMetricsToken(req.headers.authorization)) {
    return res.status(process.env.METRICS_TOKEN ? 401 : 404).end();
  }

  res.set("Content-Type", promClient.register.contentType);
  return res.send(await promClient.register.metrics());
});

app.use("/api", routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
