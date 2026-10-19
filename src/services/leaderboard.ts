import { prisma } from "../db/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { startOfUtcDay } from "./gamification.js";

export const LEADERBOARD_PERIODS = ["day", "week", "month"] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

/** Rows shown above the viewer's own row, which is added even when it falls below. */
export const LEADERBOARD_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * First UTC day the period counts: today, this week's Monday or the 1st of the month.
 * Calendar periods (not rolling windows) so everyone restarts on the same day, like the streak.
 */
export function periodStart(period: LeaderboardPeriod, now: Date): Date {
  const today = startOfUtcDay(now);
  if (period === "day") return today;
  if (period === "month") return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  return new Date(today.getTime() - daysSinceMonday * DAY_MS);
}

/** Moment the period restarts: tomorrow, next Monday or the 1st of next month (UTC). */
export function periodEnd(period: LeaderboardPeriod, now: Date): Date {
  const start = periodStart(period, now);
  if (period === "day") return new Date(start.getTime() + DAY_MS);
  if (period === "week") return new Date(start.getTime() + 7 * DAY_MS);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

/** Adds the points of a review to today's total, the source of every period ranking. */
export async function addDailyPoints(transaction: Prisma.TransactionClient, userId: string, points: number, now: Date): Promise<void> {
  if (points <= 0) return;
  const day = startOfUtcDay(now);
  await transaction.userDailyPoints.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, points },
    update: { points: { increment: points } },
  });
}

export type RankedUser = { rank: number; userId: string; name: string | null; avatarUrl: string | null; country: string | null; points: number };

type LeaderboardQuery = {
  from: Date;
  viewerId: string;
  country?: string | null;
  /** Limits the ranking to these users (the viewer and their friends). */
  userIds?: string[];
};

/**
 * Users ranked by the points earned since `from`, ties sharing a rank. Returns the top
 * rows plus the viewer's row wherever it is; users without points in the period are left out.
 */
export async function rankByPoints({ from, viewerId, country, userIds }: LeaderboardQuery): Promise<{ rows: RankedUser[]; viewer: RankedUser | null }> {
  // Compared as a date literal: a timestamp parameter would be cast with the session's time zone.
  const filters = [Prisma.sql`d."day" >= ${from.toISOString().slice(0, 10)}::date`];
  if (country) filters.push(Prisma.sql`u."country" = ${country}`);
  if (userIds) filters.push(userIds.length ? Prisma.sql`u."id" IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.sql`FALSE`);

  const ranked = await prisma.$queryRaw<Array<RankedUser & { position: bigint; rank: bigint }>>`
    WITH totals AS (
      SELECT u."id" AS "userId", u."name", u."avatarUrl", u."country", SUM(d."points")::int AS "points"
      FROM "UserDailyPoints" d
      JOIN "User" u ON u."id" = d."userId"
      WHERE ${Prisma.join(filters, " AND ")}
      GROUP BY u."id"
      HAVING SUM(d."points") > 0
    ), ranked AS (
      SELECT *, RANK() OVER (ORDER BY "points" DESC) AS "rank", ROW_NUMBER() OVER (ORDER BY "points" DESC, "userId") AS "position"
      FROM totals
    )
    SELECT * FROM ranked
    WHERE "position" <= ${LEADERBOARD_SIZE} OR "userId" = ${viewerId}::uuid
    ORDER BY "position"`;

  const rows = ranked.map(({ position, rank, ...row }) => ({ row: { ...row, rank: Number(rank) }, isTop: Number(position) <= LEADERBOARD_SIZE }));
  return {
    rows: rows.filter((entry) => entry.isTop).map((entry) => entry.row),
    viewer: rows.find((entry) => entry.row.userId === viewerId)?.row ?? null,
  };
}

/** Countries with at least one learner, for the ranking's country filter. */
export async function rankedCountries(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { country: { not: null } }, distinct: ["country"], select: { country: true }, orderBy: { country: "asc" } });
  return rows.flatMap((row) => (row.country ? [row.country] : []));
}

/**
 * How someone appears to people who are not their friends: first name and the initial
 * of the last word ("Ana G."). The email is never shown.
 */
export function publicName(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "Estudiante";
  return words.length === 1 ? words[0] : `${words[0]} ${words.at(-1)!.slice(0, 1).toUpperCase()}.`;
}
