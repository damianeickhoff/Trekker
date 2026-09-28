-- Episode comments and what a viewing was like.
--
-- `Comment` gains the episode it is about. Every existing comment was written
-- on a title page, so zero and zero, the show's (or the film's) own
-- conversation, is what each of them already meant; nothing is backfilled.
-- The title page's index gains the pair, so an episode's thread and the
-- show's are each one range read.
--
-- `Play` gains where it was watched and a line about it, both optional and
-- written only by the person, from the episode page.
--
-- Plain ADD COLUMNs and an index swap: no table is rebuilt, so every id,
-- reply and reaction holds. Back up the database before applying this.

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "seasonNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Comment" ADD COLUMN "episodeNumber" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Play" ADD COLUMN "place" TEXT;
ALTER TABLE "Play" ADD COLUMN "note" TEXT;

-- The title page's read, now per episode as well.
DROP INDEX "Comment_mediaType_tmdbId_createdAt_idx";
CREATE INDEX "Comment_mediaType_tmdbId_seasonNumber_episodeNumber_createdAt_idx" ON "Comment"("mediaType", "tmdbId", "seasonNumber", "episodeNumber", "createdAt");
