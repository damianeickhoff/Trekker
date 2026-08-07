import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, User } from "lucide-react";
import { getEpisodeDetail, img, tmdbConfigured } from "@/lib/tmdb";
import { BackButton } from "@/components/back-button";
import { SetupNotice } from "@/components/ui";

type Params = { type: string; id: string; season: string; episode: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id, season, episode } = await params;
  const detail = tmdbConfigured()
    ? await getEpisodeDetail(Number(id), Number(season), Number(episode))
    : null;

  return { title: detail ? `Cast — ${detail.name} — Trekker` : "Cast — Trekker" };
}

/**
 * Everybody in one episode: the regulars, whoever guest starred, and the crew.
 *
 * The episode itself shows a rail of faces, which answers "who is in this". It
 * cannot answer "who played the man in the shop" — a rail is dragged, not read,
 * and the guest cast is exactly the part that lives at the far end of it. So the
 * full list gets a page, grouped, where it can be read straight down.
 */
export default async function EpisodeCastPage({ params }: { params: Promise<Params> }) {
  const { type, id, season, episode } = await params;
  const showId = Number(id);
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (
    type !== "tv" ||
    !Number.isInteger(showId) ||
    !Number.isInteger(seasonNumber) ||
    !Number.isInteger(episodeNumber)
  ) {
    notFound();
  }

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const detail = await getEpisodeDetail(showId, seasonNumber, episodeNumber);
  if (!detail) notFound();

  const back = `/title/tv/${showId}/episode/${seasonNumber}/${episodeNumber}`;

  return (
    <>
      <BackButton to="back" fallback={back} title={detail.name} />

      <div className="rise">
        <header className="pt-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cast &amp; Crew</h1>
          <p className="ios-dim mt-1 text-sm text-ink-400">
            S{seasonNumber} E{episodeNumber} · {detail.name}
          </p>
        </header>

        {/* Crew first, and as plain rows: there is rarely a photo for a
            director and a grey circle beside every name would say only that
            TMDB has no picture. */}
        <Credits label="Directed by" names={detail.directors} />
        <Credits label="Written by" names={detail.writers} />

        <People label="Cast" people={detail.cast} />
        <People label="Guest stars" people={detail.guests} />
      </div>
    </>
  );
}

function Credits({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold tracking-wider text-ink-400 uppercase">{label}</h2>
      <div className="card px-4 py-3 text-sm text-ink-100">{names.join(", ")}</div>
    </section>
  );
}

function People({
  label,
  people,
}: {
  label: string;
  people: { id: number; name: string; character: string; profile: string | null }[];
}) {
  if (people.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold tracking-wider text-ink-400 uppercase">{label}</h2>

      <ul className="card divide-y divide-ink-800 max-sm:divide-white/10">
        {people.map((person) => (
          <li key={`${person.id}-${person.character}`}>
            <Link
              href={`/person/${person.id}`}
              className="flex items-center gap-3 p-3 transition first:rounded-t-[15px] last:rounded-b-[15px] hover:bg-ink-800/60 max-sm:hover:bg-white/5 sm:p-4"
            >
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-white/10">
                {img.profile(person.profile) ? (
                  <Image
                    src={img.profile(person.profile)!}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-white/25">
                    <User size={18} />
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

              <ChevronRight size={16} className="shrink-0 opacity-40" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
