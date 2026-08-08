-- Which country's streaming availability each person sees.
--
-- WATCH_REGION stays as the instance-wide default; this overrides it per
-- account, for the household member whose catalogue genuinely is a different
-- country's. Null — everyone, until they say otherwise — means the default.
ALTER TABLE "User" ADD COLUMN "region" TEXT;
