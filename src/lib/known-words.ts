/**
 * Words a learner knows, counted the same everywhere (profile, friends, levels): marked as
 * learned, or wanted and then mastered in review.
 */
export const knownWordsWhere = {
  OR: [{ status: "LEARNED" as const }, { status: "WANT_TO_LEARN" as const, stage: "MASTERED" as const }],
};
