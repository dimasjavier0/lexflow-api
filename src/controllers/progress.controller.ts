import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { isUuid } from "../lib/validation.js";

const progressBodySchema = z.object({
  status: z.enum(["WANT_TO_LEARN", "NOT_INTERESTED", "LEARNED"]),
});

export async function updateProgress(request: Request, response: Response): Promise<void> {
  const user = request.authUser;
  const wordId = request.params.wordId;

  if (!user || !isUuid(wordId)) {
    response.status(400).json({ message: "Invalid word id" });
    return;
  }

  const parsedBody = progressBodySchema.safeParse(request.body);
  if (!parsedBody.success) {
    response.status(400).json({ message: "Invalid learning status" });
    return;
  }

  const word = await prisma.word.findUnique({ where: { id: wordId }, select: { id: true } });
  if (!word) {
    response.status(404).json({ message: "Word not found" });
    return;
  }

  const progress = await prisma.userWordProgress.upsert({
    where: { userId_wordId: { userId: user.id, wordId } },
    update: { status: parsedBody.data.status },
    create: { userId: user.id, wordId, status: parsedBody.data.status },
  });

  response.status(200).json({ progress });
}

export async function listProgress(request: Request, response: Response): Promise<void> {
  if (!request.authUser) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  const progress = await prisma.userWordProgress.findMany({
    where: { userId: request.authUser.id },
    select: { wordId: true, status: true, updatedAt: true },
  });

  response.status(200).json({ progress });
}