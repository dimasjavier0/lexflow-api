export type ReviewResult = "correct" | "hard" | "incorrect";

export type SrsState = { repetitions: number; intervalDays: number; easeFactor: number };

export type SrsUpdate = SrsState & { stage: "LEARNING" | "MASTERED"; nextReviewAt: Date };

/** Consecutive successful reviews after which a word counts as mastered. */
export const MASTERED_AFTER_REPETITIONS = 4;

/**
 * How much help a review gives: 1 fills in half the word, 2 offers its letters to put in
 * order, 3 mixes extra letters in and 4 is typed from memory.
 */
export const REVIEW_LEVELS = [1, 2, 3, 4] as const;
export type ReviewLevel = (typeof REVIEW_LEVELS)[number];

/** Each successful recall in a row removes some help; a failed one restarts at level 1. */
export function reviewLevel(repetitions: number): ReviewLevel {
  return REVIEW_LEVELS[Math.min(Math.max(repetitions, 0), REVIEW_LEVELS.length - 1)];
}

const MIN_EASE_FACTOR = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reviews falling on each of the next `days` days of the learner's calendar, today first.
 * Overdue and never-reviewed words count as today's. `tzOffsetMinutes` is what
 * `Date.prototype.getTimezoneOffset()` reports: minutes behind UTC.
 */
export function upcomingReviews(nextReviewAt: Array<Date | null>, now: Date, tzOffsetMinutes: number, days = 7): number[] {
  const localDay = (date: Date) => Math.floor((date.getTime() - tzOffsetMinutes * 60_000) / DAY_MS);
  const today = localDay(now);
  const counts = new Array<number>(days).fill(0);
  for (const date of nextReviewAt) {
    const daysAhead = date ? Math.max(0, localDay(date) - today) : 0;
    if (daysAhead < days) counts[daysAhead] += 1;
  }
  return counts;
}

/** SM-2 grades answers from 0 to 5; anything below 3 is a failed recall. */
const QUALITY: Record<ReviewResult, number> = { correct: 5, hard: 3, incorrect: 1 };

/**
 * SM-2 scheduling step. A failed recall restarts the repetition count and brings
 * the word back the next day; successful recalls space it out by the ease factor.
 */
export function scheduleReview(state: SrsState, result: ReviewResult, now: Date): SrsUpdate {
  const quality = QUALITY[result];
  const easeFactor = Math.max(MIN_EASE_FACTOR, state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  let repetitions: number;
  let intervalDays: number;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = state.repetitions + 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(state.intervalDays * easeFactor);
  }

  return {
    repetitions,
    intervalDays,
    easeFactor,
    stage: repetitions >= MASTERED_AFTER_REPETITIONS ? "MASTERED" : "LEARNING",
    nextReviewAt: new Date(now.getTime() + intervalDays * DAY_MS),
  };
}
