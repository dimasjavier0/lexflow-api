import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * In production CloudFront adds `x-origin-verify` with a secret only it and the API know, so
 * requests sent straight to the Lambda's own URL, skipping CloudFront, are turned away.
 * Without ORIGIN_VERIFY_SECRET (local development) every request passes.
 */
export function requireOrigin() {
  const secret = process.env.ORIGIN_VERIFY_SECRET;
  if (!secret) return (_request: Request, _response: Response, next: NextFunction) => next();
  const expected = Buffer.from(secret);

  return (request: Request, response: Response, next: NextFunction): void => {
    const received = Buffer.from(request.get("x-origin-verify") ?? "");
    if (received.length === expected.length && timingSafeEqual(received, expected)) {
      next();
      return;
    }
    response.status(403).json({ message: "Forbidden" });
  };
}
