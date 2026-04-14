import "dotenv/config";

import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Application } from "express";
import helmet from "helmet";

import routes from "./src/routes";
import { APP_CONFIG } from "./src/shared/config/constants";
import { getSwaggerHtml, openApiDocument } from "./src/shared/docs/openapi";
import { notFoundHandler } from "./src/shared/middleware/notFound.middleware";
import { errorHandler } from "./src/shared/middleware/errorHandler.middleware";
import { globalRateLimit } from "./src/shared/middleware/rateLimit.middleware";

const app: Application = express();

const allowedOrigins = APP_CONFIG.corsOrigins;

const corsOptions = {
  credentials: true,
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
app.use(express.urlencoded({ extended: true, limit: APP_CONFIG.formBodyLimit }));
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

app.get("/docs/openapi.json", (_req, res) => {
  res.status(200).json(openApiDocument);
});

app.get("/docs", (_req, res) => {
  res.type("html").send(getSwaggerHtml());
});

app.use("/api", routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
