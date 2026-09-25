-- Badges that arrived with an imported history pay nothing towards the Trekker
-- level (see `achievements/xp.ts`), but `carried` was added with a default of
-- false, so an unlock written before the account's starting line could be
-- counted as earned here. Anything unlocked before that line was the history's
-- doing: mark it carried. Where no line has been drawn yet, the first play
-- logged here stands in for it, since nothing before that was done in Trekker.
--
-- Only accounts with imported plays: an account with none earned everything it
-- has here, and its first badges are written a moment before its line is drawn.
-- `julianday` compares instants rather than text, so a "Z" and a "+00:00"
-- suffix on the ISO strings Prisma writes cannot upset the order.
UPDATE "UnlockedAchievement"
SET "carried" = true
WHERE "carried" = false
  AND EXISTS (
    SELECT 1 FROM "Play" p
    WHERE p."userId" = "UnlockedAchievement"."userId" AND p."source" IN ('trakt', 'backfill')
  )
  AND julianday("unlockedAt") < julianday(COALESCE(
    (SELECT u."levelBaselineAt" FROM "User" u WHERE u."id" = "UnlockedAchievement"."userId"),
    (SELECT MIN(p."watchedAt") FROM "Play" p
      WHERE p."userId" = "UnlockedAchievement"."userId" AND p."source" NOT IN ('trakt', 'backfill'))
  ));
