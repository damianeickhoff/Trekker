/*
  Warnings:

  - You are about to drop the column `avatarUrl` on the `User` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "accent" TEXT NOT NULL DEFAULT 'violet',
    "avatarData" BLOB,
    "avatarType" TEXT,
    "avatarSetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plexUrl" TEXT,
    "plexToken" TEXT,
    "plexMachineId" TEXT,
    "seerrUrl" TEXT,
    "seerrApiKey" TEXT
);
INSERT INTO "new_User" ("accent", "createdAt", "email", "id", "name", "passwordHash", "plexMachineId", "plexToken", "plexUrl", "seerrApiKey", "seerrUrl") SELECT "accent", "createdAt", "email", "id", "name", "passwordHash", "plexMachineId", "plexToken", "plexUrl", "seerrApiKey", "seerrUrl" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Ratings moved from a 1-5 star scale to a 1-100 percentage. Anything still
-- inside the old range is rescaled (4 stars -> 80%); values above 5 are already
-- percentages and are left alone.
UPDATE "Rating" SET "score" = "score" * 20 WHERE "score" <= 5;
