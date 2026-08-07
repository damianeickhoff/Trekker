-- AlterTable
ALTER TABLE "User" ADD COLUMN "providers" TEXT;

-- CreateTable
CREATE TABLE "DroppedShow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "showId" INTEGER NOT NULL,
    "showName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DroppedShow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DroppedShow_userId_idx" ON "DroppedShow"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DroppedShow_userId_showId_key" ON "DroppedShow"("userId", "showId");
