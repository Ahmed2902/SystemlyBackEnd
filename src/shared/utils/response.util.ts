import type { Response } from "express";

export const ok = (res: Response, data: unknown, statusCode = 200) => {
  return res.status(statusCode).json({ success: true, data });
};

export const fail = (res: Response, error: string, statusCode = 400, code = "ERROR") => {
  return res.status(statusCode).json({ success: false, error, code });
};

export default { ok, fail };
