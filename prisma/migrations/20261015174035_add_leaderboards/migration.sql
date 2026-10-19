-- AlterTable
ALTER TABLE "User" ADD COLUMN     "country" VARCHAR(2);

-- CreateTable
CREATE TABLE "UserDailyPoints" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserDailyPoints_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "UserDailyPoints_day_idx" ON "UserDailyPoints"("day");

-- CreateIndex
CREATE INDEX "User_country_idx" ON "User"("country");

-- AddForeignKey
ALTER TABLE "UserDailyPoints" ADD CONSTRAINT "UserDailyPoints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
