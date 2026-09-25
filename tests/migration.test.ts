import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BEFORE_STEP_2, STEP_2, TMP } from "./global-setup";

/**
 * The step 2 migration, run on a fixture database built the way the current
 * app's database was (every earlier migration, applied by Prisma in global
 * setup), then filled with rows of the shapes that exist in real data. The
 * migration is applied as its SQL
 * file, exactly as `prisma migrate deploy` would, and the fixture is thrown
 * away afterwards. Nothing here touches `data/trekker.db`.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, "../prisma/migrations");

let db: Database.Database;
let before: Map<string, string[]>;

function columns(table: string) {
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((c) => c.name);
}

function tables() {
  return (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as {
      name: string;
    }[]
  ).map((t) => t.name);
}

beforeAll(() => {
  const file = path.join(TMP, `migration-fixture-${process.pid}.db`);
  fs.copyFileSync(BEFORE_STEP_2, file);
  db = new Database(file);

  const now = Date.now();
  db.exec(`
    INSERT INTO "User" (id, email, name, passwordHash, createdAt, tokenVersion)
      VALUES ('u1', 'a@example.com', 'A', 'hash', ${now}, 3), ('u2', 'b@example.com', 'B', NULL, ${now}, 0);
    INSERT INTO "Rating" (id, userId, mediaType, tmdbId, title, score, updatedAt) VALUES
      ('r1', 'u1', 'movie', 1, 'One', 100, ${now}),
      ('r2', 'u1', 'movie', 2, 'Two', 85, ${now}),
      ('r3', 'u1', 'movie', 3, 'Three', 61, ${now}),
      ('r4', 'u1', 'movie', 4, 'Four', 60, ${now}),
      ('r5', 'u1', 'movie', 5, 'Five', 30, ${now}),
      ('r6', 'u1', 'movie', 6, 'Six', 20, ${now}),
      ('r7', 'u1', 'movie', 7, 'Seven', 1, ${now}),
      ('r8', 'u1', 'movie', 8, 'Eight', 0, ${now});
    INSERT INTO "EpisodeRating" (id, userId, showId, seasonNumber, episodeNumber, liked, updatedAt) VALUES
      ('e1', 'u1', 10, 1, 1, 1, ${now}), ('e2', 'u1', 10, 1, 2, 0, ${now});
    INSERT INTO "Play" (id, userId, mediaType, tmdbId, title, seasonNumber, episodeNumber, runtime, watchedAt, source) VALUES
      ('p1', 'u1', 'tv', 10, 'Show', 1, 1, 45, ${now}, 'manual'),
      ('p2', 'u1', 'tv', 10, 'Show', 1, 1, 45, ${now + 1}, 'manual'),
      ('p3', 'u1', 'movie', 20, 'Film', NULL, NULL, 120, ${now}, 'plex');
    INSERT INTO "WatchedEpisode" (id, userId, showId, showName, seasonNumber, episodeNumber, episodeName, runtime, watchedAt, plays)
      VALUES ('w1', 'u1', 10, 'Show', 1, 1, 'Pilot', 45, ${now}, 2);
    INSERT INTO "WatchedMovie" (id, userId, movieId, title, runtime, watchedAt, plays)
      VALUES ('m1', 'u1', 20, 'Film', 120, ${now}, 1);
  `);

  before = new Map(tables().map((t) => [t, columns(t)]));
  db.exec(fs.readFileSync(path.join(MIGRATIONS, STEP_2, "migration.sql"), "utf8"));
});

afterAll(() => db?.close());

describe("the step 2 migration", () => {
  it("keeps every table and every column that was there", () => {
    for (const [table, cols] of before) {
      expect(columns(table), table).toEqual(expect.arrayContaining(cols));
    }
  });

  it("adds the new tables", () => {
    expect(tables()).toEqual(
      expect.arrayContaining(["TitleState", "ShowEpisode", "TmdbCache", "Availability", "Person"]),
    );
  });

  it("converts percentages to popcorn by halving a score out of ten and rounding up", () => {
    const rows = db.prepare(`SELECT id, score, legacyScore FROM "Rating" ORDER BY id`).all();
    expect(rows).toEqual([
      { id: "r1", score: 5, legacyScore: 100 },
      { id: "r2", score: 5, legacyScore: 85 },
      { id: "r3", score: 4, legacyScore: 61 },
      { id: "r4", score: 3, legacyScore: 60 },
      { id: "r5", score: 2, legacyScore: 30 },
      { id: "r6", score: 1, legacyScore: 20 },
      { id: "r7", score: 1, legacyScore: 1 },
      // Out of range before; clamped onto the scale rather than left off it.
      { id: "r8", score: 1, legacyScore: 0 },
    ]);
  });

  it("maps episode thumbs to full and empty, keeping the thumb", () => {
    const rows = db.prepare(`SELECT id, liked, score FROM "EpisodeRating" ORDER BY id`).all();
    expect(rows).toEqual([
      { id: "e1", liked: 1, score: 4 },
      { id: "e2", liked: 0, score: 2 },
    ]);
  });

  it("fills the cached counts from the existing history", () => {
    const u1 = db.prepare(`SELECT * FROM "User" WHERE id = 'u1'`).get() as Record<string, unknown>;
    expect(u1).toMatchObject({
      watchedEpisodeCount: 1,
      watchedMovieCount: 1,
      playCount: 3,
      minutesWatched: 210,
      backfillFinishedAt: null,
      // Untouched: sessions issued by the current app stay valid.
      tokenVersion: 3,
      passwordHash: "hash",
    });
    const u2 = db.prepare(`SELECT playCount, minutesWatched FROM "User" WHERE id = 'u2'`).get();
    expect(u2).toEqual({ playCount: 0, minutesWatched: 0 });
  });

  it("adds the indexes the plan asks for", () => {
    const names = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as { name: string }[]
    ).map((i) => i.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "User_createdAt_idx",
        "UnlockedAchievement_userId_unlockedAt_idx",
        "NotificationRead_userId_readAt_idx",
        "TitleState_userId_lastWatchedAt_idx",
        "TitleState_userId_nextAirDate_idx",
        "ShowEpisode_airDate_idx",
      ]),
    );
  });

  it("leaves rows that hang off User attached", () => {
    const orphans = db
      .prepare(`SELECT COUNT(*) AS n FROM "Play" p LEFT JOIN "User" u ON u.id = p.userId WHERE u.id IS NULL`)
      .get();
    expect(orphans).toEqual({ n: 0 });
    expect(db.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
  });
});
