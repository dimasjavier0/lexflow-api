import type { NextFunction, Request, Response } from "express";

type RateLimitOptions = { windowMs: number; max: number };

const MAX_TRACKED_CLIENTS = 10_000;

/**
 * Fixed-window limiter keyed by client IP. State lives in memory, which fits the
 * single API process of the MVP; a multi-instance deployment needs a shared store.
 */
export function rateLimit({ windowMs, max }: RateLimitOptions) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = request.ip ?? "unknown";
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      if (windows.size >= MAX_TRACKED_CLIENTS) {
        for (const [client, entry] of windows) if (entry.resetAt <= now) windows.delete(client);
      }
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }

    window.count += 1;
    if (window.count > max) {
      response.setHeader("Retry-After", String(Math.ceil((window.resetAt - now) / 1000)));
      response.status(429).json({ message: "Too many requests" });
      return;
    }
    next();
  };
}
