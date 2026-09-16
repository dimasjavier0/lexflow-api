import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

export async function listCollections(_request: Request, response: Response): Promise<void> {
  const collections = await prisma.collection.findMany({
    where: { isPublished: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      _count: { select: { words: true } },
    },
  });

  response.status(200).json({ collections });
}

export async function getCollection(request: Request, response: Response): Promise<void> {
  const slug = request.params.slug;

  if (typeof slug !== "string") {
    response.status(404).json({ message: "Collection not found" });
    return;
  }

  const collection = await prisma.collection.findFirst({
    where: { slug, isPublished: true },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      words: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          word: {
            select: {
              id: true,
              term: true,
              translationEs: true,
              level: true,
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