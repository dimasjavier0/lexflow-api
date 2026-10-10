import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { levelQuerySchema } from "../lib/validation.js";

export async function listCollections(request: Request, response: Response): Promise<void> {
  const parsed = levelQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid level" });
    return;
  }

  const { level } = parsed.data;
  const visibleWord = { isPublished: true, ...(level ? { level } : {}) };
  const [collections, levelRows] = await Promise.all([
    prisma.collection.findMany({
      // With a level selected, collections without words of that level are left out.
      where: { isPublished: true, ...(level ? { words: { some: { word: visibleWord } } } : {}) },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        _count: { select: { words: { where: { word: visibleWord } } } },
      },
    }),
    prisma.word.findMany({
      where: { isPublished: true, collections: { some: { collection: { isPublished: true } } } },
      distinct: ["level"],
      orderBy: { level: "asc" },
      select: { level: true },
    }),
  ]);

  response.status(200).json({ collections, levels: levelRows.map((row) => row.level) });
}

export async function getCollection(request: Request, response: Response): Promise<void> {
  const slug = request.params.slug;
  const parsed = levelQuerySchema.safeParse(request.query);

  if (typeof slug !== "string") {
    response.status(404).json({ message: "Collection not found" });
    return;
  }
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid level" });
    return;
  }

  const { level } = parsed.data;
  const collection = await prisma.collection.findFirst({
    where: { slug, isPublished: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      words: {
        where: { word: { isPublished: true, ...(level ? { level } : {}) } },
        orderBy: { position: "asc" },
        select: {
          position: true,
          word: {
            select: {
              id: true,
              term: true,
              translationEs: true,
              level: true,
              partOfSpeech: true,
              sentences: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, text: true, translationEs: true } },
              relationsFrom: {
                where: { target: { isPublished: true } },
                orderBy: { createdAt: "asc" },
                select: { id: true, type: true, target: { select: { term: true, translationEs: true } } },
              },
              images: { orderBy: { position: "asc" } },
              audios: { orderBy: { position: "asc" } },
              videos: { orderBy: { position: "asc" } },
            },
          },
        },
      },
    },
  });

  if (!collection) {
    response.status(404).json({ message: "Collection not found" });
    return;
  }

  response.status(200).json({ collection });
}

const wordSearchSchema = z.object({
  q: z.string().trim().min(1).max(50),
});

const WORD_SEARCH_LIMIT = 8;

/** Autocomplete: published words whose term starts with the query, most frequent first. */
export async function searchWords(request: Request, response: Response): Promise<void> {
  const parsed = wordSearchSchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid search" });
    return;
  }

  const inPublishedCollection = { collection: { isPublished: true } };
  const words = await prisma.word.findMany({
    where: { isPublished: true, term: { startsWith: parsed.data.q, mode: "insensitive" }, collections: { some: inPublishedCollection } },
    orderBy: [{ frequencyRank: { sort: "asc", nulls: "last" } }, { term: "asc" }],
    take: WORD_SEARCH_LIMIT,
    select: {
      id: true,
      term: true,
      level: true,
      collections: { where: inPublishedCollection, take: 1, select: { collection: { select: { slug: true, name: true } } } },
    },
  });

  response.status(200).json({
    words: words.flatMap(({ collections, ...word }) => (collections[0] ? [{ ...word, collection: collections[0].collection }] : [])),
  });
}
