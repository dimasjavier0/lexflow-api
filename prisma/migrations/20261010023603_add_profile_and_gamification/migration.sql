-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "lastActivityOn" DATE,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "pointsTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakBest" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "streakCurrent" INTEGER NOT NULL DEFAULT 0;
