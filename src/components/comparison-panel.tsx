import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import type { Comparison } from "@/lib/comparison";
import { img } from "@/lib/images";

/**
 * The overlap between two people: what you both watch, how far apart your
 * scores land, and what they are into that you have not touched.
 */
export function ComparisonPanel({
  comparison,
  name,
}: {
  comparison: Comparison;
  name: string;
}) {
  const { sharedShows, sharedMovies, theirPicks, disagreements, averageGap } = comparison;
  const nothing = sharedShows === 0 && sharedMovies === 0 && theirPicks.length === 0;
  if (nothing) return null;

  const first = name.split(" ")[0];

  return (
    <section className="card mt-4 overflow-hidden p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Users size={15} className="text-flare-400" />
        You and {first}
      </h2>

      <p className="mt-2 max-w-2xl text-lg leading-relaxed font-medium tracking-tight sm:text-xl">
        {sharedShows > 0 || sharedMovies > 0 ? (
          <>
            You have both watched{" "}
            <span className="text-flare-400">
              {sharedShows} show{sharedShows === 1 ? "" : "s"}
            </span>
            {sharedMovies > 0 && (
              <>
                {" "}
                and{" "}
                <span className="text-ember-400">
                  {sharedMovies} film{sharedMovies === 1 ? "" : "s"}
                </span>
              </>
            )}
            .
          </>
        ) : (
          <>No overlap yet — you are watching completely different things.</>
        )}
        {averageGap !== null && (
          <>
            {" "}
            Where you have both scored something, you land{" "}
            <span className="text-flare-400">{averageGap} points</span> apart on average.
          </>
        )}
      </p>

      {disagreements.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[11px] font-medium tracking-wider text-ink-500 uppercase">
            Where you disagree
          </h3>
          <ul className="mt-2 divide-y divide-ink-800">
            {disagreements.map((row) => (
              <li key={row.key}>
                <Link
                  href={`/title/${row.mediaType}/${row.tmdbId}`}
                  className="flex items-center gap-3 py-2.5 transition hover:opacity-80"
                >
                  <span className="relative block h-12 w-8 shrink-0 overflow-hidden rounded-md bg-ink-800">
                    {img.poster(row.poster, "w185") && (
                      <Image
                        src={img.poster(row.poster, "w185")!}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.title}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">
                    <span className="text-flare-400">{row.yours}</span>
                    <span className="mx-1 text-ink-600">vs</span>
                    <span className="text-ember-400">{row.theirs}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {theirPicks.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[11px] font-medium tracking-wider text-ink-500 uppercase">
            They watch, you do not
          </h3>
          <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6">
            {theirPicks.map((show) => (
              <Link key={show.showId} href={`/title/tv/${show.showId}`} className="group">
                <span className="relative block aspect-2/3 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
                  {img.poster(show.poster) && (
                    <Image
                      src={img.poster(show.poster)!}
                      alt=""
                      fill
                      sizes="120px"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  )}
                </span>
                <span className="mt-1.5 line-clamp-1 block text-xs font-medium">{show.name}</span>
                <span className="block text-[11px] text-ink-500">
                  {show.episodes} episode{show.episodes === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
