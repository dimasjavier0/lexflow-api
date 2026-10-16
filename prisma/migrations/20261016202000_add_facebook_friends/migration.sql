-- AlterTable
ALTER TABLE "User" ADD COLUMN     "facebookFriendsGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "facebookId" TEXT;

-- CreateTable
CREATE TABLE "Friendship" (
    "userId" UUID NOT NULL,
    "friendId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("userId","friendId")
);

-- CreateIndex
CREATE INDEX "Friendship_friendId_idx" ON "Friendship"("friendId");

-- CreateIndex
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
