import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type AuthenticatedUser = {
  id: string;
  email: string;
  claims: JWTPayload;
};

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabaseIssuer(): string | null {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  return supabaseUrl ? `${supabaseUrl}/auth/v1` : null;
}

async function verifySupabaseToken(token: string): Promise<JWTPayload> {
  const issuer = getSupabaseIssuer();

  if (issuer) {
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience: "authenticated",
      });
      return payload;
    } catch {
      // Older Supabase projects use an HS256 JWT secret instead of JWKS.
    }
  }

  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) throw new Error("Missing Supabase JWT verification key");

  const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
    algorithms: ["HS256"],
  });
  return payload;
}

export async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  try {
    const payload = await verifySupabaseToken(token);
    const id = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;

    if (!id || !email || !uuidPattern.test(id)) {
      response.status(401).json({ message: "Invalid authentication claims" });
      return;
    }

    request.authUser = { id, email, claims: payload };
    next();
  } catch {
    response.status(401).json({ message: "Invalid or expired token" });
  }
}