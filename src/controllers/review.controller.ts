import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { isUuid } from "../lib/validation.js";
import { levelProgress, pointsForReview, streakAfterActivity } from "../services/gamification.js";
import { scheduleReview } from "../services/srs.js";

const dueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const reviewBodySchema = z.object({
  result: z.enum(["correct", "hard", "incorrect"]),
});

/** Words the learner asked to learn whose next review has arrived (or that were never reviewed). */
function dueWhere(userId: string, now: Date) {
  return {
    userId,
    status: "WANT_TO_LEARN" as const,
    OR: [{ nextReviewAt: null }, { nextReviewAt: { lte: now } }],
    word: { isPublished: true, collections: { some: { collection: { isPublished: true } } } },
  };
}

export async function countDueReviews(userId: string, now = new Date()): Promise<number> {
  return prisma.userWordProgress.count({ where: dueWhere(userId, now) });
}

export async function listDueReviews(request: Request, response: Response): Promise<void> {
  const user = request.authUser;
  const parsed = dueQuerySchema.safeParse(request.query);
  if (!user || !parsed.success) {
    response.status(400).json({ message: "Invalid review query" });
    return;
  }

  const now = new Date();
  const where = dueWhere(user.id, now);
  const [total, rows] = await Promise.all([
    prisma.userWordProgress.count({ where }),
    prisma.userWordProgress.findMany({
      where,
      // Overdue words first; never-reviewed ones (null) come last.
      orderBy: [{ nextReviewAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: parsed.data.limit,
      select: {
        stage: true,
        repetitions: true,
        word: {
          select: {
            id: true,
            term: true,
            translationEs: true,
            level: true,
            partOfSpeech: true,
            sentences: { orderBy: { position: "asc" }, select: { id: true, text: true, translationEs: true } },
            images: { orderBy: { position: "asc" }, select: { id: true, url: true } },
            audios: { orderBy: { position: "asc" }, select: { id: true, url: true } },
          },
        },
      },
    }),
  ]);

  response.status(200).json({ total, items: rows });
}

export async function submitReview(request: Request, response: Response): Promise<void> {
  const user = request.authUser;
  const wordId = request.params.wordId;
  const parsed = reviewBodySchema.safeParse(request.body);
  if (!user || !isUuid(wordId) || !parsed.success) {
    response.status(400).json({ message: "Invalid review data" });
    return;
  }

  const userId = user.id;
  const progress = await prisma.userWordProgress.findUnique({
    where: { userId_wordId: { userId, wordId } },
    select: { id: true, repetitions: true, intervalDays: true, easeFactor: true, stage: true },
  });
  if (!progress) {
    response.status(404).json({ message: "Word is not in your review list" });
    return;
  }

  const now = new Date();
  const update = scheduleReview(progress, parsed.data.result, now);
  const becameMastered = progress.stage !== "MASTERED" && update.stage === "MASTERED";
  const pointsEarned = pointsForReview(parsed.data.result, becameMastered);

  const { updated, stats } = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.userWordProgress.update({
      where: { id: progress.id },
      data: { ...update, lastReviewedAt: now },
      select: { wordId: true, stage: true, repetitions: true, intervalDays: true, nextReviewAt: true },
    });
    const current = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      select: { streakCurrent: true, streakBest: true, lastActivityOn: true },
    });
    // Any completed review keeps the streak alive, right or wrong.
    const stats = await transaction.user.update({
      where: { id: userId },
      data: { ...streakAfterActivity(current, now), pointsTotal: { increment: pointsEarned } },
      select: { pointsTotal: true, streakCurrent: true, streakBest: true },
    });
    return { updated, stats };
  });

  response.status(200).json({
    progress: updated,
    becameMastered,
    pointsEarned,
    stats: { ...stats, level: levelProgress(stats.pointsTotal).level },
  });
}
