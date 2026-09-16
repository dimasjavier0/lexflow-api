import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";

export async function requireAdmin(request: Request, response: Response, next: NextFunction): Promise<void> {
  if (!request.authUser) {
    response.status(401).json({ message: "Authentication required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: request.authUser.id }, select: { role: true } });
  if (user?.role !== "ADMIN") {
    response.status(403).json({ message: "Admin access required" });
    return;
  }

  next();
}