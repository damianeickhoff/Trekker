-- Step 9: Plex, Overseerr and Trakt. Additive: nullable columns and two
-- counters with defaults, nothing rewritten.
--
-- On User: the two webhook secrets (sealed, on the admin's row), when each
-- person's Plex history was last read, and an import's progress, stored like
-- the backfill's so Home can draw its card from a row.
-- On Availability: when Overseerr said a title arrived, who asked for it, and
-- the title and poster, so the bell can say so without another lookup.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "plexWebhookSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "seerrWebhookSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "plexSyncedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "importSource" TEXT;
ALTER TABLE "User" ADD COLUMN "importStage" TEXT;
ALTER TABLE "User" ADD COLUMN "importTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "importDone" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "importStartedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "importFinishedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "importSummary" TEXT;

-- AlterTable
ALTER TABLE "Availability" ADD COLUMN "availableAt" DATETIME;
ALTER TABLE "Availability" ADD COLUMN "requestedById" TEXT;
ALTER TABLE "Availability" ADD COLUMN "title" TEXT;
ALTER TABLE "Availability" ADD COLUMN "poster" TEXT;

-- CreateIndex
CREATE INDEX "Availability_availableAt_idx" ON "Availability"("availableAt");
