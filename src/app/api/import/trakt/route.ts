import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createImportJob,
  failImportJob,
  finishImportJob,
  findRunningImport,
  getImportJob,
  reporterFor,
  type ImportJob,
} from "@/lib/import-jobs";
import {
  defaultTraktClientId,
  getWatchedMovies,
  getWatchedShows,
  TraktError,
} from "@/lib/trakt";
import { parseTraktExport, TraktExportError } from "@/lib/trakt-export";
import { ingest } from "@/lib/trakt-ingest";
import { tmdbConfigured } from "@/lib/tmdb";

/**
 * Starting and watching a Trakt import.
 *
 * A route rather than a server action, for two reasons that both used to end in
 * the same broken page. An export is a zip of a few megabytes and server
 * actions cap their request body at a megabyte, so the upload had a ceiling
 * nothing in the UI mentioned. And the run itself takes minutes, which is far
 * too long to leave a POST open — see `import-jobs` for what that cost.
 *
 * So this hands the work off and answers immediately. `POST` starts a job and
 * returns its id; `GET ?job=<id>` says how it is going. `GET` with no id
 * answers with whatever this user already has running, which is what lets a
 * reload — or an installed app coming back to the foreground — rejoin an import
 * instead of appearing to have lost it.
 */

// A full Trakt export of a heavy watcher is a couple of megabytes.
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

/** What the page is given. The user id is nobody's business but the server's. */
function shape(job: ImportJob) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    done: job.done,
    total: job.total,
    error: job.error,
    summary: job.summary,
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("job");
  const job = id ? getImportJob(id, user.id) : findRunningImport(user.id);

  // A job that has aged out of the registry is not an error: it finished, and
  // the page has almost certainly already read its summary.
  if (!job) return NextResponse.json({ job: null });

  return NextResponse.json({ job: shape(job) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  if (!tmdbConfigured()) {
    return NextResponse.json({ error: "TMDB_API_KEY is not set on the server" }, { status: 400 });
  }

  // One at a time. Two runs over the same history would race each other on
  // every "is this already logged?" check the ingest makes.
  const already = findRunningImport(user.id);
  if (already) return NextResponse.json({ job: shape(already) });

  const contentType = request.headers.get("content-type") ?? "";
  const fromFile = contentType.includes("multipart/form-data");

  // Everything up to here is quick, and everything that can be told to the
  // reader as a plain "that will not work" happens before a job exists — a
  // failed job the page has to poll for is a worse way to say "choose a file".
  let movies;
  let shows;

  if (fromFile) {
    const form = await request.formData();
    const file = form.get("export");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Choose your export file" }, { status: 400 });
    }
    if (file.size > MAX_EXPORT_BYTES) {
      return NextResponse.json({ error: "That file is larger than 64 MB" }, { status: 400 });
    }

    try {
      const history = parseTraktExport(Buffer.from(await file.arrayBuffer()), file.name);
      movies = history.movies;
      shows = history.shows;
    } catch (error) {
      const message =
        error instanceof TraktExportError ? error.message : "Could not read that file";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else {
    const account = await db.user.findUnique({
      where: { id: user.id },
      select: { traktUsername: true, traktClientId: true },
    });

    const username = account?.traktUsername?.trim();
    const clientId = account?.traktClientId?.trim() || defaultTraktClientId();

    if (!username) {
      return NextResponse.json({ error: "Save your Trakt username first" }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ error: "Save a Trakt client id first" }, { status: 400 });
    }

    try {
      [movies, shows] = await Promise.all([
        getWatchedMovies(username, clientId),
        getWatchedShows(username, clientId),
      ]);
    } catch (error) {
      const message = error instanceof TraktError ? error.message : "Could not reach Trakt";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const job = createImportJob(user.id, "Starting");
  const report = reporterFor(job);

  /**
   * Deliberately not awaited. The response goes out now and the run carries on
   * in this process, which is the whole point — and which is also why this only
   * works because Trekker is a long-lived server rather than a function that is
   * torn down the moment it replies.
   */
  void ingest(user.id, movies, shows, report)
    .then((summary) => finishImportJob(job, summary))
    .catch((error) => {
      console.error("Trakt import failed", error);
      failImportJob(job, error instanceof Error ? error.message : "The import failed");
    });

  return NextResponse.json({ job: shape(job) });
}
