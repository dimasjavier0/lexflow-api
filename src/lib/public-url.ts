import type { Request } from "express";

/** Origin the API is being reached at, used to build URLs for files in /uploads. */
export function publicBaseUrl(request: Request): string {
  return `${request.protocol}://${request.get("host")}`;
}
