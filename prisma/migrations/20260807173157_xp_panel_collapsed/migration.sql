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
    "plexManaged" BOOLEAN NOT NULL DEFAULT false,
    "plexHomeLinkedAt" DATETIME,
    "providers" TEXT,
    "coverBackdrop" TEXT,
    "coverTitle" TEXT,
    "accent" TEXT NOT NULL DEFAULT 'violet',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "themeResolved" TEXT NOT NULL DEFAULT 'dark',
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
    "traktUsername" TEXT,
    "levelFinishedShows" INTEGER NOT NULL DEFAULT 0,
    "levelFinishedFranchises" INTEGER NOT NULL DEFAULT 0,
    "levelSyncedAt" DATETIME,
    "levelBaseShows" INTEGER NOT NULL DEFAULT 0,
    "levelBaseFranchises" INTEGER NOT NULL DEFAULT 0,
    "levelBaselineAt" DATETIME,
    "challengesCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "xpPanelCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "screensaverIdle" INTEGER NOT NULL DEFAULT 0,
    "screensaverSource" TEXT NOT NULL DEFAULT 'trending',
    "screensaverPlace" TEXT,
    "screensaverLat" REAL,
    "screensaverLon" REAL,
    "levelKnownKeys" TEXT
);
INSERT INTO "new_User" ("accent", "avatarData", "avatarSetAt", "avatarType", "challengesCollapsed", "coverBackdrop", "coverTitle", "createdAt", "email", "id", "levelBaseFranchises", "levelBaseShows", "levelBaselineAt", "levelFinishedFranchises", "levelFinishedShows", "levelKnownKeys", "levelSyncedAt", "name", "passwordHash", "plexAccountId", "plexAuthToken", "plexHomeLinkedAt", "plexMachineId", "plexManaged", "plexToken", "plexUrl", "plexUsername", "providers", "screensaverIdle", "screensaverLat", "screensaverLon", "screensaverPlace", "screensaverSource", "seerrApiKey", "seerrUrl", "theme", "themeResolved", "traktClientId", "traktUsername") SELECT "accent", "avatarData", "avatarSetAt", "avatarType", "challengesCollapsed", "coverBackdrop", "coverTitle", "createdAt", "email", "id", "levelBaseFranchises", "levelBaseShows", "levelBaselineAt", "levelFinishedFranchises", "levelFinishedShows", "levelKnownKeys", "levelSyncedAt", "name", "passwordHash", "plexAccountId", "plexAuthToken", "plexHomeLinkedAt", "plexMachineId", "plexManaged", "plexToken", "plexUrl", "plexUsername", "providers", "screensaverIdle", "screensaverLat", "screensaverLon", "screensaverPlace", "screensaverSource", "seerrApiKey", "seerrUrl", "theme", "themeResolved", "traktClientId", "traktUsername" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_plexAccountId_key" ON "User"("plexAccountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
