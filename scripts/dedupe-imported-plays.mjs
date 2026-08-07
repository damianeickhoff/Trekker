/**
 * One-off: collapse the duplicate viewings left behind by the play log's own
 * backfill.
 *
 * The `rewatch_plays` migration gave every existing watched row a `backfill`
 * play with no `sourceRef`. That erased the only mark saying which Plex history
 * entries had already been imported, so the next sync pulled them all in again
 * — and where the two dates were further apart than the duplicate window, the
 * result was a title that claims to have been watched twice on the strength of
 * one viewing.
 *
 * This finds the identities carrying both, and drops the ref-less import row,
 * keeping the sourced one because its date is the precise one. Genuine extra
 * viewings survive: never more ref-less rows are removed than there are sourced
 * rows to account for them.
 *
 * `recordPlay` now adopts rather than duplicates, so this should only ever need
 * running once.
 *
 *   node scripts/dedupe-imported-plays.mjs            # dry run
 *   node scripts/dedupe-imported-plays.mjs --apply
 */
import Database from "better-sqlite3";
import path from "node:path";

const apply = process.argv.includes("--apply");
const dbArg = process.argv.find((a) => a.startsWith("--db="));
const file = path.resolve(dbArg ? dbArg.slice(5) : "dev.db");

/** Sources whose ref-less rows stand for a viewing somebody else knew first. */
const ADOPTABLE = ["backfill", "trakt", "plex"];

const db = new Database(file, { readonly: !apply, fileMustExist: true });

const placeholders = ADOPTABLE.map(() => "?").join(",");

/**
 * Grouped by identity — the same key `plays.ts` uses. `IS` rather than `=` on
 * the nullable episode columns: a film has none, and SQL equality on null is
 * never true.
 */
const groups = db
  .prepare(
    `SELECT userId, mediaType, tmdbId, seasonNumber, episodeNumber, title,
            SUM(sourceRef IS NOT NULL) AS sourced,
            SUM(sourceRef IS NULL AND source IN (${placeholders})) AS unproven
       FROM Play
      GROUP BY userId, mediaType, tmdbId, seasonNumber, episodeNumber
     HAVING sourced > 0 AND unproven > 0
      ORDER BY title, seasonNumber, episodeNumber`,
  )
  .all(...ADOPTABLE);

const pickable = db.prepare(
  `SELECT id, watchedAt, source FROM Play
    WHERE userId = ? AND mediaType = ? AND tmdbId = ?
      AND seasonNumber IS ? AND episodeNumber IS ?
      AND sourceRef IS NULL AND source IN (${placeholders})
    ORDER BY watchedAt ASC
    LIMIT ?`,
);

const drop = db.prepare("DELETE FROM Play WHERE id = ?");

const resyncEpisode = db.prepare(
  `UPDATE WatchedEpisode
      SET plays = (SELECT COUNT(*) FROM Play p WHERE p.userId = WatchedEpisode.userId
                     AND p.mediaType = 'tv' AND p.tmdbId = WatchedEpisode.showId
                     AND p.seasonNumber = WatchedEpisode.seasonNumber
                     AND p.episodeNumber = WatchedEpisode.episodeNumber),
          watchedAt = (SELECT MIN(p.watchedAt) FROM Play p WHERE p.userId = WatchedEpisode.userId
                     AND p.mediaType = 'tv' AND p.tmdbId = WatchedEpisode.showId
                     AND p.seasonNumber = WatchedEpisode.seasonNumber
                     AND p.episodeNumber = WatchedEpisode.episodeNumber),
          lastWatchedAt = (SELECT MAX(p.watchedAt) FROM Play p WHERE p.userId = WatchedEpisode.userId
                     AND p.mediaType = 'tv' AND p.tmdbId = WatchedEpisode.showId
                     AND p.seasonNumber = WatchedEpisode.seasonNumber
                     AND p.episodeNumber = WatchedEpisode.episodeNumber)
    WHERE userId = ? AND showId = ? AND seasonNumber = ? AND episodeNumber = ?`,
);

const resyncMovie = db.prepare(
  `UPDATE WatchedMovie
      SET plays = (SELECT COUNT(*) FROM Play p WHERE p.userId = WatchedMovie.userId
                     AND p.mediaType = 'movie' AND p.tmdbId = WatchedMovie.movieId),
          watchedAt = (SELECT MIN(p.watchedAt) FROM Play p WHERE p.userId = WatchedMovie.userId
                     AND p.mediaType = 'movie' AND p.tmdbId = WatchedMovie.movieId),
          lastWatchedAt = (SELECT MAX(p.watchedAt) FROM Play p WHERE p.userId = WatchedMovie.userId
                     AND p.mediaType = 'movie' AND p.tmdbId = WatchedMovie.movieId)
    WHERE userId = ? AND movieId = ?`,
);

const label = (g) =>
  g.mediaType === "tv"
    ? `${g.title} S${String(g.seasonNumber).padStart(2, "0")}E${String(g.episodeNumber).padStart(2, "0")}`
    : g.title;

let removed = 0;

const run = () => {
  for (const g of groups) {
    // Never drop more than the sourced rows can account for: an episode with
    // two ref-less rows and one sourced row really was watched twice.
    const take = Math.min(g.unproven, g.sourced);

    const rows = pickable.all(
      g.userId,
      g.mediaType,
      g.tmdbId,
      g.seasonNumber,
      g.episodeNumber,
      ...ADOPTABLE,
      take,
    );

    console.log(
      `${label(g).padEnd(46)} ${g.sourced} sourced + ${g.unproven} unproven -> dropping ${rows.length}`,
    );
    for (const row of rows) console.log(`      ${row.source}  ${row.watchedAt}`);

    if (!apply) continue;

    for (const row of rows) drop.run(row.id);
    removed += rows.length;

    if (g.mediaType === "tv") {
      resyncEpisode.run(g.userId, g.tmdbId, g.seasonNumber, g.episodeNumber);
    } else {
      resyncMovie.run(g.userId, g.tmdbId);
    }
  }
};

console.log(`${file}\n${groups.length} identities carry both an unproven and a sourced play\n`);

if (apply) db.transaction(run)();
else run();

console.log(
  apply
    ? `\nDone. ${removed} plays removed, watched rows recomputed from what is left.`
    : "\nDry run — nothing written. Re-run with --apply.",
);
