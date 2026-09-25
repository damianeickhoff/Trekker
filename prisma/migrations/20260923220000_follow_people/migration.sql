-- Following a person from the actor page, and what the daily job finds new in
-- their work. Additive only: two new tables and two nullable columns on the
-- Person cache, so nothing that exists is rewritten.

-- AlterTable
ALTER TABLE "Person" ADD COLUMN "credits" TEXT;
ALTER TABLE "Person" ADD COLUMN "creditsCheckedAt" DATETIME;

-- CreateTable
CREATE TABLE "FollowedPerson" (
    "userId" TEXT NOT NULL,
    "personId" INTEGER NOT NULL,
    "followedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "personId"),
    CONSTRAINT "FollowedPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PersonNews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personId" INTEGER NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FollowedPerson_personId_idx" ON "FollowedPerson"("personId");

-- CreateIndex
CREATE INDEX "PersonNews_personId_at_idx" ON "PersonNews"("personId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "PersonNews_personId_mediaType_tmdbId_kind_key" ON "PersonNews"("personId", "mediaType", "tmdbId", "kind");

