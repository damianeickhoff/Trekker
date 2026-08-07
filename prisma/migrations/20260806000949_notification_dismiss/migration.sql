-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationRead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationRead" ("id", "key", "readAt", "userId") SELECT "id", "key", "readAt", "userId" FROM "NotificationRead";
DROP TABLE "NotificationRead";
ALTER TABLE "new_NotificationRead" RENAME TO "NotificationRead";
CREATE INDEX "NotificationRead_userId_idx" ON "NotificationRead"("userId");
CREATE UNIQUE INDEX "NotificationRead_userId_key_key" ON "NotificationRead"("userId", "key");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
