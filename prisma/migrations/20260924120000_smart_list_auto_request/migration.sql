-- A smart list asking Overseerr for what is new on it. The switch itself,
-- "MediaList"."autoRequest", came over from the current app and is already
-- there, off everywhere by default; this adds only the record of what each
-- list has asked for, so nothing is asked for twice and the daily cap has
-- something to count. Additive: one new table, nothing rewritten.

-- CreateTable
CREATE TABLE "MediaListRequest" (
    "listId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("listId", "mediaType", "tmdbId"),
    CONSTRAINT "MediaListRequest_listId_fkey" FOREIGN KEY ("listId") REFERENCES "MediaList" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MediaListRequest_listId_requestedAt_idx" ON "MediaListRequest"("listId", "requestedAt");
