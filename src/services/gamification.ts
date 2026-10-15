import type { ReviewResult } from "./srs.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Points are only earned by successful recalls, never by browsing. Any help halves them. */
const REVIEW_POINTS: Record<ReviewResult, number> = { correct: 2, hard: 1, retried: 1, incorrect: 0 };
const MASTERED_BONUS = 5;
/** Points that open level 2; level n starts at (n - 1)² times this. */
const LEVEL_STEP = 20;

export function pointsForReview(result: ReviewResult, becameMastered: boolean): number {
  return REVIEW_POINTS[result] + (becameMastered ? MASTERED_BONUS : 0);
}

/**
 * Level n starts at (n - 1)² × 20 points: 0, 20, 80, 180… Each level asks for
 * more than the previous one without needing a hand-maintained threshold table.
 */
export function levelProgress(pointsTotal: number): { level: number; pointsIntoLevel: number; pointsForLevel: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, pointsTotal) / LEVEL_STEP)) + 1;
  const floor = (level - 1) ** 2 * LEVEL_STEP;
  return { level, pointsIntoLevel: pointsTotal - floor, pointsForLevel: level ** 2 * LEVEL_STEP - floor };
}

/** Calendar days are counted in UTC so a streak means the same on every server. */
function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(dayNumber(date) * DAY_MS);
}

type StreakState = { streakCurrent: number; streakBest: number; lastActivityOn: Date | null };

/** Streak after practising today: +1 if yesterday was active, restart at 1 after a gap. */
export function streakAfterActivity(state: StreakState, now: Date): { streakCurrent: number; streakBest: number; lastActivityOn: Date } {
  const today = dayNumber(now);
  const last = state.lastActivityOn ? dayNumber(state.lastActivityOn) : null;
  const streakCurrent = last === today ? Math.max(1, state.streakCurrent) : last === today - 1 ? state.streakCurrent + 1 : 1;
  return { streakCurrent, streakBest: Math.max(state.streakBest, streakCurrent), lastActivityOn: startOfUtcDay(now) };
}

/** The stored streak is only still alive if the learner practised today or yesterday. */
export function currentStreak(state: StreakState, now: Date): number {
  if (!state.lastActivityOn) return 0;
  return dayNumber(now) - dayNumber(state.lastActivityOn) <= 1 ? state.streakCurrent : 0;
}
