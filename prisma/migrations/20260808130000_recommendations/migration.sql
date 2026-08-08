-- "You should watch this."
--
-- The one social action the app could not perform. Friends, reviews, score
-- comparisons and an activity feed all existed; handing somebody a title did
-- not, so every recommendation was inferred from what they happened to watch.
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "poster" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" DATETIME,
    "dismissedAt" DATETIME,
    CONSTRAINT "Recommendation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Recommendation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One standing recommendation per person per title: pressing the button twice
-- is the same sentence said twice, not two suggestions.
CREATE UNIQUE INDEX "Recommendation_fromUserId_toUserId_mediaType_tmdbId_key"
    ON "Recommendation"("fromUserId", "toUserId", "mediaType", "tmdbId");

-- The read the notification centre makes: what is waiting for me.
CREATE INDEX "Recommendation_toUserId_dismissedAt_idx"
    ON "Recommendation"("toUserId", "dismissedAt");
