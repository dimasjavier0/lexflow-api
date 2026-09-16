import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";

export async function getMe(request: Request, response: Response): Promise<void> {
  const authUser = request.authUser;

  if (!authUser) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  const user = await prisma.user.upsert({
    where: { id: authUser.id },
    update: { email: authUser.email },
    create: { id: authUser.id, email: authUser.email },
    select: { id: true, email: true, role: true, createdAt: true, updatedAt: true },
  });

  response.status(200).json({ user });
}