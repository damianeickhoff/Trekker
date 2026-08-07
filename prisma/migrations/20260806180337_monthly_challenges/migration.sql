-- CreateTable
CREATE TABLE "ChallengeRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChallengeRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChallengeRun_userId_period_idx" ON "ChallengeRun"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeRun_userId_key_period_key" ON "ChallengeRun"("userId", "key", "period");
