-- Everything earned before the notification centre existed is history, not news.
--
-- Without this, switching the bell on hands every existing user a wall of
-- unread badges going back to their first day — which is exactly the noise that
-- makes people stop reading a notification list at all. Badges earned from here
-- on notify normally and, as asked, stay until they are marked read.
--
-- OR IGNORE because anything already marked read has a row, and re-marking it
-- is not an error.
INSERT OR IGNORE INTO "NotificationRead" ("id", "userId", "key", "readAt")
SELECT 'seed_' || "id", "userId", 'badge:' || "key", CURRENT_TIMESTAMP
FROM "UnlockedAchievement";
