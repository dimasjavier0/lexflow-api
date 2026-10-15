import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { isCountryCode } from "../lib/countries.js";
import { currentStreak, levelProgress } from "../services/gamification.js";
import { googleProfile, googleProfilePatch } from "../services/google-profile.js";
import { REVIEW_LEVELS, reviewLevel, upcomingReviews } from "../services/srs.js";
import { countDueReviews, reviewableWhere } from "./review.controller.js";

const profileSelect = {
  id: true,
  email: true,
  role: true,
  name: true,
  avatarUrl: true,
  country: true,
  pointsTotal: true,
  streakCurrent: true,
  streakBest: true,
  lastActivityOn: true,
  createdAt: true,
  updatedAt: true,
} as const;

type ProfileRow = {
  id: string;
  email: string;
  role: string;
  name: string | null;
  avatarUrl: string | null;
  country: string | null;
  pointsTotal: number;
  streakCurrent: number;
  streakBest: number;
  lastActivityOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Adds the derived gamification values (level, live streak) to a stored user. */
export function toProfile(user: ProfileRow, now = new Date()) {
  const { lastActivityOn: _lastActivityOn, ...rest } = user;
  return { ...rest, streakCurrent: currentStreak(user, now), ...levelProgress(user.pointsTotal) };
}

const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(60).nullable().optional(),
  avatarUrl: z.string().trim().url().max(500).nullable().optional(),
  /** ISO 3166-1 alpha-2 code; places the learner in their country's ranking. */
  country: z.string().trim().toUpperCase().refine(isCountryCode).nullable().optional(),
});

export async function getMe(request: Request, response: Response): Promise<void> {
  const authUser = request.authUser;

  if (!authUser) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  const google = googleProfile(authUser.claims);
  let user = await prisma.user.upsert({
    where: { id: authUser.id },
    update: { email: authUser.email },
    create: { id: authUser.id, email: authUser.email, ...google },
    select: profileSelect,
  });
  // Accounts created before this, and pictures changed on Google since, catch up here.
  const patch = googleProfilePatch(user, google);
  if (patch) user = await prisma.user.update({ where: { id: authUser.id }, data: patch, select: profileSelect });

  response.status(200).json({ user: toProfile(user) });
}

export async function updateMe(request: Request, response: Response): Promise<void> {
  const authUser = request.authUser;
  const parsed = updateProfileSchema.safeParse(request.body);
  if (!authUser || !parsed.success) {
    response.status(400).json({ message: "Invalid profile data" });
    return;
  }

  const user = await prisma.user.update({ where: { id: authUser.id }, data: parsed.data, select: profileSelect });
  response.status(200).json({ user: toProfile(user) });
}

const dashboardQuerySchema = z.object({
  /** Minutes the learner's clock is behind UTC, as `Date.prototype.getTimezoneOffset()` reports it. */
  tzOffset: z.coerce.number().int().min(-840).max(720).default(0),
});

/** Everything the learner's progress page shows, in one request. */
export async function getMyDashboard(request: Request, response: Response): Promise<void> {
  const authUser = request.authUser;
  if (!authUser) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }
  const parsed = dashboardQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid dashboard query" });
    return;
  }

  const now = new Date();
  const [user, byStatus, byStage, dueReviews, scheduled] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: authUser.id }, select: profileSelect }),
    prisma.userWordProgress.groupBy({ by: ["status"], where: { userId: authUser.id }, _count: { _all: true } }),
    prisma.userWordProgress.groupBy({ by: ["stage"], where: { userId: authUser.id, status: "WANT_TO_LEARN" }, _count: { _all: true } }),
    countDueReviews(authUser.id, now),
    prisma.userWordProgress.findMany({ where: reviewableWhere(authUser.id), select: { repetitions: true, nextReviewAt: true } }),
  ]);

  const statusCount = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  const stageCount = (stage: string) => byStage.find((row) => row.stage === stage)?._count._all ?? 0;

  response.status(200).json({
    user: toProfile(user),
    words: { wantToLearn: statusCount("WANT_TO_LEARN"), learned: statusCount("LEARNED"), notInterested: statusCount("NOT_INTERESTED") },
    review: {
      due: dueReviews,
      new: stageCount("NEW"),
      learning: stageCount("LEARNING"),
      mastered: stageCount("MASTERED"),
      /** Words at each review level, lowest first. */
      levels: REVIEW_LEVELS.map((level) => scheduled.filter((row) => reviewLevel(row.repetitions) === level).length),
      /** Reviews falling on each of the next seven days, today first. */
      upcoming: upcomingReviews(scheduled.map((row) => row.nextReviewAt), now, parsed.data.tzOffset),
    },
  });
}
