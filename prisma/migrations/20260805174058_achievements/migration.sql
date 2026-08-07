-- CreateTable
CREATE TABLE "UnlockedAchievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnlockedAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TitleMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "genres" TEXT NOT NULL,
    "originalLanguage" TEXT,
    "releaseDate" TEXT,
    "runtime" INTEGER,
    "collectionId" INTEGER,
    "collectionName" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "UnlockedAchievement_userId_idx" ON "UnlockedAchievement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UnlockedAchievement_userId_key_key" ON "UnlockedAchievement"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TitleMeta_mediaType_tmdbId_key" ON "TitleMeta"("mediaType", "tmdbId");
