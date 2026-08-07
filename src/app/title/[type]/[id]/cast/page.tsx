import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { User } from "lucide-react";
import { getMovie, getTv, img, tmdbConfigured } from "@/lib/tmdb";
import { BackButton } from "@/components/back-button";
import { SetupNotice } from "@/components/ui";

type Params = { type: string; id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { type, id } = await params;
  if (type !== "movie" && type !== "tv") return { title: "Trekker" };

  const title = await (type === "movie" ? getMovie(Number(id)) : getTv(Number(id)))
    .then((data) => ("title" in data ? data.title : data.name))
    .catch(() => null);

  return { title: title ? `Cast — ${title} — Trekker` : "Cast — Trekker" };
}

/**
 * Everybody in a title, as a page of its own.
 *
 * The title page shows a rail of the first eighteen, which is the right answer
 * to "who is in this" and the wrong one to "who played the man in the shop".
 * A rail cannot be scanned — you drag it, and anyone past the tenth is work to
 * reach — so the full list gets somewhere it can simply be read.
 *
 * A route rather than a dialog, because a person's page opens *from* here and
 * has to be able to come back. Nested under the title so the URL says where it
 * belongs, and so the back button has somewhere obvious to fall back to.
 */
export default async function CastPage({ params }: { params: Promise<Params> }) {
  const { type, id } = await params;
  const tmdbId = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(tmdbId)) notFound();

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const detail = await (type === "movie" ? getMovie(tmdbId) : getTv(tmdbId)).catch(() => null);
  if (!detail) notFound();

  const name = "title" in detail ? detail.title : detail.name;
  const cast = detail.credits.cast;

  return (
    <>
      <BackButton to="back" fallback={`/title/${type}/${tmdbId}`} />

      <div className="rise">
        <header className="pt-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cast</h1>
          <p className="ios-dim mt-1 text-sm text-ink-400">
            {name} · {cast.length} credited role{cast.length === 1 ? "" : "s"}
          </p>
        </header>

        {cast.length === 0 ? (
          <p className="mt-6 text-sm text-ink-400">Nobody is credited for this one yet.</p>
        ) : (
          /* One card, rows inside it — the same shape the episode list uses.
             A grid of tiles looks like a gallery, and this is a list you read
             top to bottom looking for one name. */
          <ul className="card mt-5 divide-y divide-ink-800 max-sm:divide-white/10">
            {cast.map((person) => {
              const profile = img.profile(person.profile_path);

              return (
                <li key={`${person.id}-${person.character}`}>
                  <Link
                    href={`/person/${person.id}`}
                    className="flex items-center gap-3 p-3 transition first:rounded-t-[15px] last:rounded-b-[15px] hover:bg-ink-800/60 max-sm:hover:bg-white/5 sm:gap-4 sm:p-4"
                  >
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-ink-800 max-sm:bg-white/10">
                      {profile ? (
                        <Image src={profile} alt="" fill sizes="56px" className="object-cover" />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-white/25">
                          <User size={20} />
                        </span>
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-100">
                        {person.name}
                      </span>
                      {person.character && (
                        <span className="ios-dim block truncate text-xs text-ink-400">
                          {person.character}
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
