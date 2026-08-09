-- Comments and feelings: the first content on this instance that is not
-- friends-only.
--
-- Everything social here has been scoped to accepted friendships — reviews,
-- activity, score comparisons. That is right for a watch history and wrong for
-- a conversation: a comment nobody outside your friends can join is a diary
-- with extra steps. Watch history and profiles are untouched and still private.

-- A comment on a title, or a reply to one. `parentId` null means a comment;
-- set means a reply. Only one level is allowed, which SQL cannot express — the
-- parent's own `parentId` is checked in `postComment`.
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Cascading is what makes deleting a comment take its replies with it.
    CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The read the title page makes: everything said about one title, in order.
CREATE INDEX "Comment_mediaType_tmdbId_createdAt_idx" ON "Comment"("mediaType", "tmdbId", "createdAt");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- One emoji from a fixed set, per person per comment. The unique key is what
-- makes the same emoji twice a toggle rather than two reactions, while leaving
-- somebody free to add several different ones.
CREATE TABLE "CommentReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CommentReaction_commentId_userId_emoji_key" ON "CommentReaction"("commentId", "userId", "emoji");
CREATE INDEX "CommentReaction_commentId_idx" ON "CommentReaction"("commentId");

-- How a title made somebody feel. One per person per title — picking the one
-- you already have clears it, the same shape as an episode thumb.
CREATE TABLE "Feeling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "feeling" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Feeling_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Feeling_userId_mediaType_tmdbId_key" ON "Feeling"("userId", "mediaType", "tmdbId");
-- The tally the title page draws.
CREATE INDEX "Feeling_mediaType_tmdbId_idx" ON "Feeling"("mediaType", "tmdbId");
