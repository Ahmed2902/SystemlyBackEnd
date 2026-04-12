import type { NextFunction, Request, Response } from "express";

export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`) as Error & {
    code?: string;
    statusCode?: number;
  };

  error.statusCode = 404;
  error.code = "ROUTE_NOT_FOUND";

  next(error);
};
