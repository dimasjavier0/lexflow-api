import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { knownWordsWhere } from "../lib/known-words.js";
import { CEFR_LEVELS, type CefrLevel } from "../lib/validation.js";

/** Every published word in a published collection, with its level: the base of both counts. */
async function publishedPlacements(wordIds?: string[]) {
  return prisma.collectionWord.findMany({
    where: { collection: { isPublished: true }, word: { isPublished: true }, ...(wordIds ? { wordId: { in: wordIds } } : {}) },
    select: { collectionId: true, wordId: true, word: { select: { level: true } } },
  });
}

type Placement = Awaited<ReturnType<typeof publishedPlacements>>[number];

/**
 * Per level: how many different words it has (a word in two collections counts once) and how
 * many of them each collection holds.
 */
function countByLevel(placements: Placement[]) {
  const words = new Map<CefrLevel, Set<string>>(CEFR_LEVELS.map((level) => [level, new Set()]));
  const byCollection = new Map<CefrLevel, Map<string, number>>(CEFR_LEVELS.map((level) => [level, new Map()]));
  for (const { collectionId, wordId, word } of placements) {
    words.get(word.level)!.add(wordId);
    const collections = byCollection.get(word.level)!;
    collections.set(collectionId, (collections.get(collectionId) ?? 0) + 1);
  }
  return { words, byCollection };
}

/**
 * The home page's catalogue: the six CEFR levels in order, each with its word count and the
 * topic collections that have words of that level (counting only those words). Levels with
 * no words yet are listed too, empty.
 */
export async function listLevels(_request: Request, response: Response): Promise<void> {
  const [placements, collections] = await Promise.all([
    publishedPlacements(),
    prisma.collection.findMany({
      where: { isPublished: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, description: true, imageUrl: true },
    }),
  ]);
  const { words, byCollection } = countByLevel(placements);

  response.status(200).json({
    levels: CEFR_LEVELS.map((level) => {
      const counts = byCollection.get(level)!;
      return {
        level,
        words: words.get(level)!.size,
        collections: collections.filter((collection) => counts.has(collection.id)).map((collection) => ({ ...collection, _count: { words: counts.get(collection.id)! } })),
      };
    }),
  });
}

/**
 * The learner's progress per level: the words of each level they know (learned, or mastered
 * in review), in total and per collection. Paired with GET /levels it gives "x % of A1".
 */
export async function summarizeLevelProgress(request: Request, response: Response): Promise<void> {
  const user = request.authUser;
  if (!user) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  const known = await prisma.userWordProgress.findMany({ where: { userId: user.id, ...knownWordsWhere }, select: { wordId: true } });
  const { words, byCollection } = countByLevel(known.length ? await publishedPlacements(known.map((row) => row.wordId)) : []);

  response.status(200).json({
    levels: CEFR_LEVELS.map((level) => ({
      level,
      known: words.get(level)!.size,
      collections: Object.fromEntries(byCollection.get(level)!),
    })),
  });
}
