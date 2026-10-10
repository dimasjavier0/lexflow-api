export type ReviewResult = "correct" | "hard" | "incorrect";

export type SrsState = { repetitions: number; intervalDays: number; easeFactor: number };

export type SrsUpdate = SrsState & { stage: "LEARNING" | "MASTERED"; nextReviewAt: Date };

/** Consecutive successful reviews after which a word counts as mastered. */
export const MASTERED_AFTER_REPETITIONS = 4;

const MIN_EASE_FACTOR = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

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
