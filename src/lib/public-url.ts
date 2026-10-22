import type { Request } from "express";

/**
 * Origin that serves /uploads, used to build the URLs of stored files. Behind CloudFront the
 * request's Host is the Lambda's own address: CloudFront sends its own address in
 * `x-public-origin` instead, trusted only when requireOrigin has proved the request came
 * through CloudFront. PUBLIC_BASE_URL overrides both.
 */
export function publicBaseUrl(request: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const forwarded = process.env.ORIGIN_VERIFY_SECRET ? request.get("x-public-origin") : undefined;
  return forwarded?.startsWith("https://") ? forwarded : `${request.protocol}://${request.get("host")}`;
}
