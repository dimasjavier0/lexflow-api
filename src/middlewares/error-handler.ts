import type { NextFunction, Request, Response } from "express";
import { isPrismaError } from "../lib/prisma-errors.js";
import { isProgressStream } from "../lib/progress-stream.js";

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (response.headersSent) {
    // A progress stream cannot change its status any more: say it failed and close it.
    console.error(error);
    if (isProgressStream(response) && !response.writableEnded) response.write(`${JSON.stringify({ type: "error" })}\n`);
    response.end();
    return;
  }
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
