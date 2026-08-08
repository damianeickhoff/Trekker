-- What the last auto-request run filed, so the bell can report it.
--
-- A feature that spends somebody's disk overnight must not be silent about
-- having done so. The notification is derived from these two columns and the
-- timestamp beside them, in the same way everything else in the bell is derived
-- from the row that caused it.
ALTER TABLE "MediaList" ADD COLUMN "autoRequestedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MediaList" ADD COLUMN "autoRequestedTitles" TEXT;
