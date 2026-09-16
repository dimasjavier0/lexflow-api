import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).optional(),
  isPublished: z.boolean().optional(),
});

const wordSchema = z.object({
  term: z.string().trim().min(1).max(100),
  translationEs: z.string().trim().min(1).max(200),
  level: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).default("A1"),
  isPublished: z.boolean().optional(),
});

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listAdminCollections(_request: Request, response: Response): Promise<void> {
  const collections = await prisma.collection.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { words: true } } },
  });
  response.status(200).json({ collections });
}

export async function createAdminCollection(request: Request, response: Response): Promise<void> {
  const parsed = collectionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid collection data", issues: parsed.error.issues });
    return;
  }

  try {
    const collection = await prisma.collection.create({ data: parsed.data });
    response.status(201).json({ collection });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      response.status(409).json({ message: "Collection slug already exists" });
      return;
    }
    throw error;
  }
}

export async function listAdminWords(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (typeof collectionId !== "string" || !uuidPattern.test(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const words = await prisma.collectionWord.findMany({
    where: { collectionId },
    orderBy: { position: "asc" },
    select: {
      position: true,
      word: { select: { id: true, term: true, translationEs: true, level: true, isPublished: true } },
    },
  });

  response.status(200).json({ words });
}

export async function createAdminWord(request: Request, response: Response): Promise<void> {
  const collectionId = request.params.collectionId;
  if (typeof collectionId !== "string" || !uuidPattern.test(collectionId)) {
    response.status(400).json({ message: "Invalid collection id" });
    return;
  }

  const parsed = wordSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: "Invalid word data", issues: parsed.error.issues });
    return;
  }

  const collection = await prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
  if (!collection) {
    response.status(404).json({ message: "Collection not found" });
    return;
  }

  const word = await prisma.word.upsert({
    where: { term: parsed.data.term },
    update: {
      translationEs: parsed.data.translationEs,
      level: parsed.data.level,
      isPublished: parsed.data.isPublished ?? false,
    },
    create: {
      term: parsed.data.term,
      translationEs: parsed.data.translationEs,
      level: parsed.data.level,
      isPublished: parsed.data.isPublished ?? false,
    },
  });

  const existing = await prisma.collectionWord.findUnique({
    where: { collectionId_wordId: { collectionId, wordId: word.id } },
  });
  if (existing) {
    response.status(409).json({ message: "Word already belongs to this collection" });
    return;
  }

  const lastWord = await prisma.collectionWord.findFirst({
    where: { collectionId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const relation = await prisma.collectionWord.create({
    data: { collectionId, wordId: word.id, position: (lastWord?.position ?? 0) + 1 },
    select: { position: true, word: { select: { id: true, term: true, translationEs: true, level: true, isPublished: true } } },
  });

  response.status(201).json({ word: relation });
}