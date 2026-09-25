-- T2: news. `PersonNews` is generalised into `NewsItem`, whose subject is a
-- person, a show or a film. Every `PersonNews` row is carried over with its
-- id, so the bell's read marks (`news:<id>`) still hold, and with the words
-- the bell used to work out on reading ("New from Kyle Chandler", "Lanterns
-- announced"), the person's name read from `Person`. Then the old table goes.
-- Back up the database before applying this.

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "image" TEXT,
    "headline" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_key_key" ON "NewsItem"("key");

-- CreateIndex
CREATE INDEX "NewsItem_subject_subjectId_at_idx" ON "NewsItem"("subject", "subjectId", "at");

-- CreateIndex
CREATE INDEX "NewsItem_at_idx" ON "NewsItem"("at");

-- Carry PersonNews over, one row each.
INSERT INTO "NewsItem" ("id", "subject", "subjectId", "kind", "mediaType", "tmdbId", "title", "image", "headline", "detail", "at", "key")
SELECT
    n."id",
    'person',
    n."personId",
    n."kind",
    n."mediaType",
    n."tmdbId",
    n."title",
    p."profilePath",
    'New from ' || COALESCE(p."name", 'someone you follow'),
    n."title" || CASE n."kind" WHEN 'released' THEN ' is out' ELSE ' announced' END,
    n."at",
    'person:' || n."personId" || ':' || n."mediaType" || '-' || n."tmdbId" || ':' || n."kind"
FROM "PersonNews" n
LEFT JOIN "Person" p ON p."tmdbId" = n."personId";

-- DropIndex
DROP INDEX "PersonNews_personId_at_idx";

-- DropIndex
DROP INDEX "PersonNews_personId_mediaType_tmdbId_kind_key";

-- DropTable
DROP TABLE "PersonNews";

-- AlterTable: the fourth push switch, off until asked for.
ALTER TABLE "User" ADD COLUMN "notifyNews" BOOLEAN NOT NULL DEFAULT false;
