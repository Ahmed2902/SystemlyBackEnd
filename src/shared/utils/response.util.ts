import type { Response } from "express";

export function ok(res: Response, data: unknown, statusCode = 200) {
  return res.status(statusCode).json({ success: true, data });
}

export function fail(
  res: Response,
  message: string,
  statusCode = 400,
  code = "ERROR",
  requestId: string | null = null,
) {
  return res.status(statusCode).json({
    success: false,
    error: { code, message, requestId },
  });
}

export const created = (res: Response, data: unknown) => ok(res, data, 201);
export const noContent = (res: Response) => res.status(204).end();

export default { ok, fail, created, noContent };
