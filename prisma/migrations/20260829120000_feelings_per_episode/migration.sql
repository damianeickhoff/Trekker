-- A feeling is about the thing you watched, and for a show that is an episode.
--
-- The picker used to sit on the show's own page, which asked the wrong question:
-- "how did Severance make you feel" has no answer, while "how did that episode
-- make you feel" has eight. So the identity grows a season and an episode, and
-- the picker moves to the episode page.
--
-- Zero rather than null for a film, matching `WatchedEpisode`: SQLite counts
-- NULLs in a unique index as distinct from one another, so a nullable column
-- would quietly allow one person any number of feelings about the same film.
--
-- Existing rows keep 0/0 and are left where they are. For a film that is
-- already correct — it *is* the film. For a show it is the old show-level
-- answer, which no page asks for any more; it is kept rather than deleted
-- because deleting it is not reversible and re-asking is cheap.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Feeling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL DEFAULT 0,
    "episodeNumber" INTEGER NOT NULL DEFAULT 0,
    "feeling" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Feeling_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Feeling" ("feeling", "id", "mediaType", "tmdbId", "updatedAt", "userId") SELECT "feeling", "id", "mediaType", "tmdbId", "updatedAt", "userId" FROM "Feeling";
DROP TABLE "Feeling";
ALTER TABLE "new_Feeling" RENAME TO "Feeling";
CREATE UNIQUE INDEX "Feeling_userId_mediaType_tmdbId_seasonNumber_episodeNumber_key" ON "Feeling"("userId", "mediaType", "tmdbId", "seasonNumber", "episodeNumber");
-- The tally a film's page and an episode's page each draw.
CREATE INDEX "Feeling_mediaType_tmdbId_seasonNumber_episodeNumber_idx" ON "Feeling"("mediaType", "tmdbId", "seasonNumber", "episodeNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
