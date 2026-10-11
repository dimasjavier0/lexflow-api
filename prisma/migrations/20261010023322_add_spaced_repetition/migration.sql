-- CreateEnum
CREATE TYPE "SrsStage" AS ENUM ('NEW', 'LEARNING', 'MASTERED');

-- AlterTable
ALTER TABLE "UserWordProgress" ADD COLUMN     "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
ADD COLUMN     "intervalDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "nextReviewAt" TIMESTAMP(3),
ADD COLUMN     "repetitions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stage" "SrsStage" NOT NULL DEFAULT 'NEW';

-- CreateIndex
CREATE INDEX "UserWordProgress_userId_nextReviewAt_idx" ON "UserWordProgress"("userId", "nextReviewAt");
