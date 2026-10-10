import type { Request, Response } from "express";
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
