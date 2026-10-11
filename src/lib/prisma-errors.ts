/** P2002: unique constraint violated. P2025: record to update or delete not found. */
export type PrismaErrorCode = "P2002" | "P2025";

export function isPrismaError(error: unknown, code: PrismaErrorCode): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
