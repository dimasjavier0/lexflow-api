import type { Request } from "express";

/**
 * Origin that serves /uploads, used to build the URLs of stored files. Behind CloudFront the
 * request's Host is the Lambda's own address, so production sets PUBLIC_BASE_URL instead.
 */
export function publicBaseUrl(request: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  return configured || `${request.protocol}://${request.get("host")}`;
}
