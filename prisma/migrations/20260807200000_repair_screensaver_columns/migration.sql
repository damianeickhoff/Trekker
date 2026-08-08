-- Repairs the screensaver columns on rows that predate them.
--
-- `20260807173157_xp_panel_collapsed` rebuilt the User table and copied the old
-- rows across, and its column list included the five screensaver columns — which
-- the *old* table did not have. That should have been an error. It was not,
-- because of one of SQLite's oldest compatibility warts: a double-quoted name
-- that matches no column is silently reinterpreted as a string literal. So
-- `SELECT "screensaverIdle" FROM "User"` did not fail, it returned the text
-- `screensaverIdle`, once per row, and that is what landed in the new table.
--
-- SQLite's type affinity let it stay there — an INTEGER column will hold text it
-- cannot convert — so nothing complained until Prisma read a row back and found
-- a string where an Int was declared (P2023).
--
-- Only these five are affected. The other thirty-four columns in that INSERT all
-- existed beforehand and copied correctly, and `xpPanelCollapsed` was left out of
-- the list entirely, so it took its default.
--
-- Matched on the exact bogus value rather than applied blindly, so this touches
-- only the damaged rows and is safe to run twice. A database created after the
-- rebuild has no such rows and is untouched — the copy only ever ran against
-- rows that already existed.
UPDATE "User" SET "screensaverIdle"   = 0          WHERE "screensaverIdle"   = 'screensaverIdle';
UPDATE "User" SET "screensaverSource" = 'trending' WHERE "screensaverSource" = 'screensaverSource';
UPDATE "User" SET "screensaverPlace"  = NULL       WHERE "screensaverPlace"  = 'screensaverPlace';
UPDATE "User" SET "screensaverLat"    = NULL       WHERE "screensaverLat"    = 'screensaverLat';
UPDATE "User" SET "screensaverLon"    = NULL       WHERE "screensaverLon"    = 'screensaverLon';
