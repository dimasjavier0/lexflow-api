import { z } from "zod";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Narrows a route param or JWT claim to a well-formed UUID string. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

/** CEFR levels, easiest first. */
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Optional `?level=` filter shared by the public catalogue and progress endpoints. */
export const levelQuerySchema = z.object({
  level: z.enum(CEFR_LEVELS).optional(),
});
