-- Step 3, Home and Calendar: the two facts the calendar needs that step 2 left
-- unstored. Both are filled by the refresh job, never on a render, and both are
-- nullable so an existing database is valid the moment this runs; the next
-- daily pass and the next refresh of each show fill them in.

-- A show's first air date, for announced shows with no published episodes.
ALTER TABLE "TitleState" ADD COLUMN "premiereDate" TEXT;

-- Cinema and streaming release dates for watchlisted films.
ALTER TABLE "WatchlistItem" ADD COLUMN "releaseCheckedAt" DATETIME;
ALTER TABLE "WatchlistItem" ADD COLUMN "releaseDate" TEXT;
ALTER TABLE "WatchlistItem" ADD COLUMN "streamingDate" TEXT;
