import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const collectionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).optional(),
  isPublished: z.boolean().optional(),
});

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