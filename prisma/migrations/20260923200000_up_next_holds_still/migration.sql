-- Up next keeps its order while someone ticks through it on Home: the warmth a
-- row had before the day's first Home tick, and the day that applies to. Both
-- nullable, and null means "order by lastWatchedAt", which is what every row
-- did before this ran.
ALTER TABLE "TitleState" ADD COLUMN "heldAt" DATETIME;
ALTER TABLE "TitleState" ADD COLUMN "heldOn" TEXT;
