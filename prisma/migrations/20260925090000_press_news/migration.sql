-- Round 9: popular news. `NewsItem` gains a fourth subject, "press": a
-- headline from an entertainment site's feed, kept with its source, its link
-- (unique: one row per article) and the feed's picture. A press row names a
-- title only when the cache knows one, so the title columns become nullable,
-- which SQLite can only do by rebuilding the table. Every row is copied over
-- with its id, so the bell's read marks (`news:<id>`) still hold.
-- Back up the database before applying this.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "mediaType" TEXT,
    "tmdbId" INTEGER,
    "title" TEXT,
    "image" TEXT,
    "headline" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "source" TEXT,
    "link" TEXT,
    "imageUrl" TEXT
);
INSERT INTO "new_NewsItem" ("at", "detail", "headline", "id", "image", "key", "kind", "mediaType", "subject", "subjectId", "title", "tmdbId") SELECT "at", "detail", "headline", "id", "image", "key", "kind", "mediaType", "subject", "subjectId", "title", "tmdbId" FROM "NewsItem";
DROP TABLE "NewsItem";
ALTER TABLE "new_NewsItem" RENAME TO "NewsItem";
CREATE UNIQUE INDEX "NewsItem_key_key" ON "NewsItem"("key");
CREATE UNIQUE INDEX "NewsItem_link_key" ON "NewsItem"("link");
CREATE INDEX "NewsItem_subject_subjectId_at_idx" ON "NewsItem"("subject", "subjectId", "at");
CREATE INDEX "NewsItem_at_idx" ON "NewsItem"("at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

