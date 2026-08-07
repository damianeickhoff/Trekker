-- The screensaver.
--
-- Five columns rather than a blob of JSON, because every one of them is read on
-- its own: the delay by the idle watcher in the layout, the source by the page
-- that builds the slideshow, the coordinates by the weather call. Nothing here
-- is ever read as a whole.
--
-- `screensaverIdle` is the on switch as well as the delay — zero means it never
-- starts by itself, which is what everyone gets until they ask for it.
ALTER TABLE "User" ADD COLUMN "screensaverIdle" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "screensaverSource" TEXT NOT NULL DEFAULT 'trending';
ALTER TABLE "User" ADD COLUMN "screensaverPlace" TEXT;
ALTER TABLE "User" ADD COLUMN "screensaverLat" REAL;
ALTER TABLE "User" ADD COLUMN "screensaverLon" REAL;
