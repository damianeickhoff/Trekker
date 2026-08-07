-- AlterTable
ALTER TABLE "WatchlistItem" ADD COLUMN "enrichedAt" DATETIME;
ALTER TABLE "WatchlistItem" ADD COLUMN "runtime" INTEGER;
ALTER TABLE "WatchlistItem" ADD COLUMN "streaming" TEXT;

-- CreateTable
CREATE TABLE "EpisodeRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "showId" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "liked" BOOLEAN NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EpisodeRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSent" TEXT,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EpisodeRating_userId_showId_idx" ON "EpisodeRating"("userId", "showId");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeRating_userId_showId_seasonNumber_episodeNumber_key" ON "EpisodeRating"("userId", "showId", "seasonNumber", "episodeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
