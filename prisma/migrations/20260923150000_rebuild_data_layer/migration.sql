-- The rebuild's data layer: state that the previous app recomputed from TMDB on
-- every request becomes rows a background job keeps fresh. Everything here is
-- additive except the rating scale, which is converted in place (see below) with
-- the original percentage kept beside it.
--
-- Hand-finished from `prisma migrate diff`. The one change from what Prisma
-- generated: new User columns are added with ALTER TABLE rather than by
-- rebuilding the table, since User is the table every other one hangs off and
-- rebuilding it only to append columns risks more than it buys.

-- AlterTable
ALTER TABLE "EpisodeRating" ADD COLUMN "score" INTEGER;

-- AlterTable
ALTER TABLE "Rating" ADD COLUMN "legacyScore" INTEGER;

-- CreateTable
CREATE TABLE "TitleState" (
    "userId" TEXT NOT NULL,
    "showId" INTEGER NOT NULL,
    "showName" TEXT NOT NULL,
    "showPoster" TEXT,
    "backdrop" TEXT,
    "status" TEXT NOT NULL DEFAULT 'returning',
    "airedCount" INTEGER NOT NULL DEFAULT 0,
    "watchedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "lastAirDate" TEXT,
    "nextSeason" INTEGER,
    "nextEpisode" INTEGER,
    "nextTitle" TEXT,
    "nextAirDate" TEXT,
    "nextRuntime" INTEGER,
    "nextStill" TEXT,
    "lastWatchedAt" DATETIME,
    "airedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "showId"),
    CONSTRAINT "TitleState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShowEpisode" (
    "showId" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "airDate" TEXT,
    "runtime" INTEGER,
    "still" TEXT,
    "episodeType" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("showId", "seasonNumber", "episodeNumber")
);

-- CreateTable
CREATE TABLE "TmdbCache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Availability" (
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "onPlex" BOOLEAN NOT NULL DEFAULT false,
    "plexRatingKey" TEXT,
    "overseerrStatus" TEXT NOT NULL DEFAULT 'none',
    "providers" TEXT,
    "checkedAt" DATETIME,

    PRIMARY KEY ("mediaType", "tmdbId")
);

-- CreateTable
CREATE TABLE "Person" (
    "tmdbId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "profilePath" TEXT,
    "knownForMediaType" TEXT,
    "knownForTitleId" INTEGER,
    "knownForBackdrop" TEXT,
    "bio" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable: cached counts and backfill progress on User
ALTER TABLE "User" ADD COLUMN "watchedEpisodeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "watchedMovieCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "playCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "minutesWatched" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "backfillTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "backfillDone" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "backfillStartedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "backfillFinishedAt" DATETIME;

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "TitleState_userId_lastWatchedAt_idx" ON "TitleState"("userId", "lastWatchedAt");

-- CreateIndex
CREATE INDEX "TitleState_userId_nextAirDate_idx" ON "TitleState"("userId", "nextAirDate");

-- CreateIndex
CREATE INDEX "TitleState_showId_idx" ON "TitleState"("showId");

-- CreateIndex
CREATE INDEX "TitleState_status_idx" ON "TitleState"("status");

-- CreateIndex
CREATE INDEX "ShowEpisode_airDate_idx" ON "ShowEpisode"("airDate");

-- CreateIndex
CREATE INDEX "TmdbCache_expiresAt_idx" ON "TmdbCache"("expiresAt");

-- CreateIndex
CREATE INDEX "Availability_checkedAt_idx" ON "Availability"("checkedAt");

-- CreateIndex
CREATE INDEX "NotificationRead_userId_readAt_idx" ON "NotificationRead"("userId", "readAt");

-- CreateIndex
CREATE INDEX "UnlockedAchievement_userId_unlockedAt_idx" ON "UnlockedAchievement"("userId", "unlockedAt");


-- Popcorn ratings. Percentages become five buckets by ceil(score / 20), which
-- is the same as halving a score out of ten and rounding up: 1-20 spilled,
-- 21-40 empty, 41-60 half full, 61-80 full, 81-100 golden. Lossy by design, so
-- the percentage is copied to legacyScore first. Clamped, because an old row
-- holding 0 would otherwise land outside the scale.
UPDATE "Rating" SET "legacyScore" = "score";
UPDATE "Rating" SET "score" = MIN(5, MAX(1, ("score" + 19) / 20));

-- Episode thumbs become buckets too: up is full (4), down is empty (2). A thumb
-- never said golden or spilled, so neither extreme is claimed for it.
UPDATE "EpisodeRating" SET "score" = CASE WHEN "liked" THEN 4 ELSE 2 END;

-- The cached counts start true rather than at zero, so the profile is right
-- before anyone has watched anything under the new app.
UPDATE "User" SET
  "watchedEpisodeCount" = (SELECT COUNT(*) FROM "WatchedEpisode" w WHERE w."userId" = "User"."id"),
  "watchedMovieCount"   = (SELECT COUNT(*) FROM "WatchedMovie" m WHERE m."userId" = "User"."id"),
  "playCount"           = (SELECT COUNT(*) FROM "Play" p WHERE p."userId" = "User"."id"),
  "minutesWatched"      = (SELECT COALESCE(SUM(p."runtime"), 0) FROM "Play" p WHERE p."userId" = "User"."id");

-- TitleState is deliberately not seeded here: working out the next episode
-- needs every show's episode list from TMDB, which a migration cannot fetch.
-- backfillFinishedAt stays null, so each person's first visit starts the
-- backfill and shows its progress.
