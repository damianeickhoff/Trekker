-- The single stored "starting line" number is replaced by attributing XP
-- directly: plays already carry their source, badges now carry a flag, and only
-- the two completion bonuses need a remembered starting value.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "levelBaseShows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "levelBaseFranchises" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "levelKnownKeys" TEXT;
ALTER TABLE "User" DROP COLUMN "levelBaselineXp";

-- AlterTable
ALTER TABLE "UnlockedAchievement" ADD COLUMN "carried" BOOLEAN NOT NULL DEFAULT false;

-- Every badge already on record for an account with an imported history was
-- earned by that history rather than here, so none of them may pay XP towards
-- the Trekker level. Accounts with nothing imported keep theirs.
UPDATE "UnlockedAchievement" SET "carried" = true
WHERE "userId" IN (
  SELECT DISTINCT "userId" FROM "Play" WHERE "source" IN ('trakt', 'backfill')
);

-- Same for the completion bonuses: whatever they stand at now came in with the
-- history, so the level starts counting from there.
UPDATE "User"
SET "levelBaseShows" = "levelFinishedShows",
    "levelBaseFranchises" = "levelFinishedFranchises"
WHERE "id" IN (
  SELECT DISTINCT "userId" FROM "Play" WHERE "source" IN ('trakt', 'backfill')
);
