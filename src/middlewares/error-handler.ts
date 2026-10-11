import type { NextFunction, Request, Response } from "express";
import { isPrismaError } from "../lib/prisma-errors.js";

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (response.headersSent) return;
  // Updating or deleting by an id that does not exist is a client error, not a crash.
  if (isPrismaError(error, "P2025")) {
    response.status(404).json({ message: "Resource not found" });
    return;
  }
  if (isPrismaError(error, "P2002")) {
    response.status(409).json({ message: "Resource already exists" });
    return;
  }
  console.error(error);
  response.status(500).json({ message: "Internal server error" });
}
