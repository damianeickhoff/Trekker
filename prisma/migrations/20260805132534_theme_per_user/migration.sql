-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "plexAccountId" TEXT,
    "plexAuthToken" TEXT,
    "plexUsername" TEXT,
    "coverBackdrop" TEXT,
    "coverTitle" TEXT,
    "accent" TEXT NOT NULL DEFAULT 'violet',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "avatarData" BLOB,
    "avatarType" TEXT,
    "avatarSetAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plexUrl" TEXT,
    "plexToken" TEXT,
    "plexMachineId" TEXT,
    "seerrUrl" TEXT,
    "seerrApiKey" TEXT,
    "traktClientId" TEXT,
    "traktUsername" TEXT
);
INSERT INTO "new_User" ("accent", "avatarData", "avatarSetAt", "avatarType", "coverBackdrop", "coverTitle", "createdAt", "email", "id", "name", "passwordHash", "plexAccountId", "plexAuthToken", "plexMachineId", "plexToken", "plexUrl", "plexUsername", "seerrApiKey", "seerrUrl", "traktClientId", "traktUsername") SELECT "accent", "avatarData", "avatarSetAt", "avatarType", "coverBackdrop", "coverTitle", "createdAt", "email", "id", "name", "passwordHash", "plexAccountId", "plexAuthToken", "plexMachineId", "plexToken", "plexUrl", "plexUsername", "seerrApiKey", "seerrUrl", "traktClientId", "traktUsername" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_plexAccountId_key" ON "User"("plexAccountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
