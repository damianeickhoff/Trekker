-- CreateTable
CREATE TABLE "Favourite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster" TEXT,
    "score" INTEGER,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favourite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "filters" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "refreshedAt" DATETIME,
    CONSTRAINT "MediaList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaListItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster" TEXT,
    "score" INTEGER,
    "year" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MediaList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Favourite_userId_addedAt_idx" ON "Favourite"("userId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favourite_userId_mediaType_tmdbId_key" ON "Favourite"("userId", "mediaType", "tmdbId");

-- CreateIndex
CREATE INDEX "MediaList_userId_createdAt_idx" ON "MediaList"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaListItem_listId_position_idx" ON "MediaListItem"("listId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MediaListItem_listId_mediaType_tmdbId_key" ON "MediaListItem"("listId", "mediaType", "tmdbId");
