import type { NextFunction, Request, Response } from "express";

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  console.error(error);
  if (response.headersSent) return;
  response.status(500).json({ message: "Internal server error" });
}
