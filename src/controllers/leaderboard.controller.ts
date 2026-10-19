import type { Request, Response } from "express";
import { z } from "zod";
import { isCountryCode } from "../lib/countries.js";
import { LEADERBOARD_PERIODS, periodEnd, periodStart, publicName, rankByPoints, rankedCountries, type RankedUser } from "../services/leaderboard.js";

const leaderboardQuerySchema = z.object({
  period: z.enum(LEADERBOARD_PERIODS).default("week"),
  country: z.string().trim().toUpperCase().refine(isCountryCode).optional(),
});

/** Other learners only show their public name; the viewer sees their own row in full. */
function toEntry(row: RankedUser, viewerId: string) {
  const isViewer = row.userId === viewerId;
  return {
    rank: row.rank,
    name: isViewer ? (row.name ?? "Tú") : publicName(row.name),
    avatarUrl: isViewer ? row.avatarUrl : null,
    country: row.country,
    points: row.points,
    isViewer,
  };
}

/** Learners ranked by the points earned today, this week or this month, optionally from one country. */
export async function getLeaderboard(request: Request, response: Response): Promise<void> {
  const authUser = request.authUser;
  const parsed = leaderboardQuerySchema.safeParse(request.query);
  if (!authUser || !parsed.success) {
    response.status(400).json({ message: "Invalid leaderboard query" });
    return;
  }

  const { period, country } = parsed.data;
  const now = new Date();
  const from = periodStart(period, now);
  const [{ rows, viewer }, countries] = await Promise.all([rankByPoints({ from, viewerId: authUser.id, country }), rankedCountries()]);

  response.status(200).json({
    period,
    country: country ?? null,
    endsAt: periodEnd(period, now),
    countries,
    rows: rows.map((row) => toEntry(row, authUser.id)),
    viewer: viewer ? toEntry(viewer, authUser.id) : null,
  });
}
