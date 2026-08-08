-- Letting a smart list ask Overseerr for what it finds.
--
-- Off by default, and per list rather than per account: a standing question that
-- files requests on its own is the one feature in this app that spends somebody
-- else's disk, so it has to be turned on deliberately for the one list where it
-- makes sense — not inherited by "top rated films of all time".
ALTER TABLE "MediaList" ADD COLUMN "autoRequest" BOOLEAN NOT NULL DEFAULT false;

-- "missing" skips anything already streaming on a service the user pays for;
-- "all" asks for everything the list answers with.
ALTER TABLE "MediaList" ADD COLUMN "autoRequestScope" TEXT NOT NULL DEFAULT 'missing';

-- How many one run may file. Clamped again in code — a number in a database is
-- not a promise.
ALTER TABLE "MediaList" ADD COLUMN "autoRequestCap" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "MediaList" ADD COLUMN "autoRequestedAt" DATETIME;
