-- Lists and smart lists: how long each title on a list takes to watch, so the
-- list page can add up its hours and order by length from rows. Additive only:
-- one nullable column, filled in by the next add or the next daily pass.

-- AlterTable
ALTER TABLE "MediaListItem" ADD COLUMN "runtime" INTEGER;
