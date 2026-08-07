-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "accent" TEXT NOT NULL DEFAULT 'violet',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WatchedEpisode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "showId" INTEGER NOT NULL,
    "showName" TEXT NOT NULL,
    "showPoster" TEXT,
    "seasonNumber" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "episodeName" TEXT NOT NULL,
    "runtime" INTEGER NOT NULL DEFAULT 42,
    "watchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchedEpisode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchedMovie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "movieId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster" TEXT,
    "runtime" INTEGER NOT NULL DEFAULT 0,
    "watchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchedMovie_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster" TEXT,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster" TEXT,
    "score" INTEGER NOT NULL,
    "review" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "WatchedEpisode_userId_watchedAt_idx" ON "WatchedEpisode"("userId", "watchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchedEpisode_userId_showId_seasonNumber_episodeNumber_key" ON "WatchedEpisode"("userId", "showId", "seasonNumber", "episodeNumber");

-- CreateIndex
CREATE INDEX "WatchedMovie_userId_watchedAt_idx" ON "WatchedMovie"("userId", "watchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchedMovie_userId_movieId_key" ON "WatchedMovie"("userId", "movieId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_mediaType_tmdbId_key" ON "WatchlistItem"("userId", "mediaType", "tmdbId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_mediaType_tmdbId_key" ON "Rating"("userId", "mediaType", "tmdbId");
