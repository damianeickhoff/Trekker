-- Round 10: the News page as a news app, Settings › News.
--
-- Press rows gain what the page's chips, lead story and per-person sources
-- need as columns, so none of it is worked out per render: `tag` (a keyword
-- rule on the headline), `summary` (the feed's own summary line, never the
-- article) and `feedUrl` (which feed brought it). Existing rows keep null in
-- all three; the next feed pass classifies them once and fills `feedUrl` by
-- the source's name, since the instance's feed list lives in the environment
-- and a migration cannot read it.
--
-- `NewsSource` is a person's switch per instance feed (a missing row is on),
-- `UserFeed` a feed someone added for themselves. On `User`: the news push
-- is split in two, and the second switch starts where the old one was, so
-- nobody's morning push changes on the day; and the Reading settings.
-- Plain ADD COLUMNs: no table is rebuilt, so every id and read mark holds.
-- Back up the database before applying this.

-- AlterTable
ALTER TABLE "NewsItem" ADD COLUMN "tag" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "summary" TEXT;
ALTER TABLE "NewsItem" ADD COLUMN "feedUrl" TEXT;

ALTER TABLE "User" ADD COLUMN "notifyNewsPeople" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "newsOpenOn" TEXT NOT NULL DEFAULT 'for-you';
ALTER TABLE "User" ADD COLUMN "newsMarkOnOpen" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "newsKeepDays" INTEGER NOT NULL DEFAULT 30;

-- The old switch carried a followed person's news too.
UPDATE "User" SET "notifyNewsPeople" = "notifyNews";

-- CreateTable
CREATE TABLE "NewsSource" (
    "userId" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    PRIMARY KEY ("userId", "feedUrl"),
    CONSTRAINT "NewsSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserFeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserFeed_url_idx" ON "UserFeed"("url");

-- CreateIndex
CREATE UNIQUE INDEX "UserFeed_userId_url_key" ON "UserFeed"("userId", "url");

-- CreateIndex
CREATE INDEX "NewsItem_feedUrl_idx" ON "NewsItem"("feedUrl");
