import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";
import {
  getPrismaQueryWallTimeMs,
  runWithRequestContext,
  type RequestPerformanceContext,
} from "../observability/request-context";

const DEFAULT_SLOW_REQUEST_MS = 1_000;

function slowRequestThresholdMs() {
  const parsed = Number(process.env.SLOW_REQUEST_THRESHOLD_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_SLOW_REQUEST_MS;
}

function normaliseRequestId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return crypto.randomUUID();
  return candidate.trim().slice(0, 128) || crypto.randomUUID();
}

function requestPath(req: Request) {
  return req.path || req.originalUrl.split("?", 1)[0] || "/";
}

export function requestPerformanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = normaliseRequestId(req.headers["x-request-id"]);
  const context: RequestPerformanceContext = {
    requestId,
    startedAtMs: performance.now(),
    queryCount: 0,
    queryDurationMs: 0,
    queryIntervals: [],
    slowestQueries: [],
  };

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  runWithRequestContext(context, () => {
    res.once("finish", () => {
      const durationMs =
        Math.round((performance.now() - context.startedAtMs) * 100) / 100;
      const queryDurationMs = Math.round(context.queryDurationMs * 100) / 100;
      const queryWallTimeMs =
        Math.round(getPrismaQueryWallTimeMs(context) * 100) / 100;
      const isSlow = durationMs >= slowRequestThresholdMs();
      const payload = {
        event: isSlow ? "slow_request" : "request_completed",
        requestId,
        method: req.method,
        path: requestPath(req),
        statusCode: res.statusCode,
        durationMs,
        prismaQueryCount: context.queryCount,
        prismaQueryDurationMs: queryDurationMs,
        prismaQueryWallTimeMs: queryWallTimeMs,
        nonDatabaseDurationMs: Math.max(
          0,
          Math.round((durationMs - queryWallTimeMs) * 100) / 100,
        ),
        ...(isSlow ? { slowestQueries: context.slowestQueries } : {}),
      };

      const line = JSON.stringify(payload);
      if (isSlow) console.warn(line);
      else if (process.env.LOG_REQUEST_PERFORMANCE !== "false") console.info(line);
    });

    next();
  });
}
