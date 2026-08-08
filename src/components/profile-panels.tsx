import Image from "next/image";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { formatHours } from "@/lib/format";
import type { MostWatched } from "@/lib/profile";
import { img } from "@/lib/images";
import { OVERLAY_MARK, ScoreBadge } from "./media-card";
import { Rail } from "./rail";

/**
 * The three small panels that sit under the year chart. All read from data the
 * profile page already has, and all answer a question the numbers above cannot:
 * *when* you watch, *what* you watch, and *what you keep coming back to*.
 */

export function PanelHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">{eyebrow}</p>
      <h2 className="mt-0.5 text-lg font-semibold tracking-tight">{title}</h2>
      {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

const FULL_DAY: Record<string, string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

/**
 * Minutes by day of the week.
 *
 * Small on purpose — seven bars is a shape, not a table, and the only thing
 * worth reading off it is which end of the week is heavier. The busiest column
 * is the one that gets the accent; the rest stay quiet so it can.
 */
export function WeekdayBars({ weekday }: { weekday: { label: string; minutes: number }[] }) {
  const peak = Math.max(0, ...weekday.map((d) => d.minutes));
  if (peak === 0) return null;

  const busiest = weekday.reduce((best, day, i) => (day.minutes > weekday[best].minutes ? i : best), 0);
  const total = weekday.reduce((sum, day) => sum + day.minutes, 0);
  const share = Math.round((weekday[busiest].minutes / Math.max(1, total)) * 100);

  return (
    <section className="card flex flex-col p-5">
      <PanelHead
        eyebrow="Your week"
        title="When you watch"
        sub={
          <>
            You typically watch on{" "}
            <span className="font-semibold text-flare-400">{FULL_DAY[weekday[busiest].label]}</span>
            , {share}% of your recent watching.
          </>
        }
      />

      {/* Stretches to whatever height the card ends up being, rather than a
          fixed 96px — so this card and the genre one beside it in the same grid
          row fill their boxes instead of one trailing dead space. `min-h`
          rather than `h`, because a percentage height still needs something
          definite to resolve against. */}
      <div className="mt-5 flex min-h-24 flex-1 gap-1.5">
        {weekday.map((day, i) => (
          <div key={day.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full flex-1 items-end">
              <div
                title={`${day.label}: ${formatHours(day.minutes)}`}
                className={`w-full rounded-t-md ${
                  i === busiest
                    ? "bg-gradient-to-t from-flare-600/50 to-flare-400"
                    : "bg-ink-700/80"
                }`}
                style={{ height: `${Math.max(4, (day.minutes / peak) * 100)}%` }}
              />
            </div>
            <span
              className={`text-[10px] ${
                i === busiest ? "font-semibold text-ink-200" : "text-ink-500"
              }`}
            >
              {day.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Five purples, spaced far enough apart on the violet ramp to be told apart at
 * the size of a legend dot.
 *
 * Derived from the accent, so the panel is the colour the user chose. Defined
 * in `globals.css` rather than as ramp steps here: walking `flare-300…600` was
 * the thing that made an earlier palette unreadable, since adjacent steps are
 * too close to tell apart and the gap between them changes with the hue. These
 * mix one accent colour towards the page instead, which is an even lightness
 * run in any hue and in either theme.
 */
const GENRE_BAR = [
  "balance-band-1",
  "balance-band-2",
  "balance-band-3",
  "balance-band-4",
  "balance-band-5",
] as const;

/**
 * The five genres that turn up most across everything watched.
 *
 * This replaced a shows-vs-movies split. That one only ever had two answers and
 * both were already stated as hours in the tiles above it — where this says
 * something the rest of the page does not.
 *
 * Shares are of the five shown, not of everything watched: the genre data comes
 * from a bounded sample of TMDB lookups, so a percentage claiming to cover the
 * whole history would be made up. Five percentages that add to 100 are at least
 * a claim the panel can stand behind.
 */
export function GenreSplit({ genres }: { genres: { name: string; count: number }[] }) {
  if (genres.length === 0) return null;

  const top = genres.slice(0, 5);
  const total = top.reduce((sum, g) => sum + g.count, 0);

  return (
    <section className="card flex flex-col p-5">
      <PanelHead eyebrow="The balance" title="What you watch" />

      <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full bg-ink-800">
        {top.map((genre, i) => (
          <div
            key={genre.name}
            title={`${genre.name} — ${Math.round((genre.count / total) * 100)}%`}
            className={GENRE_BAR[i]}
            style={{ width: `${(genre.count / total) * 100}%` }}
          />
        ))}
      </div>

      {/* Side by side rather than a stack of rows: five genres with a share each
          is a legend, and a legend that runs down the card for five lines makes
          the reader work through it in order instead of taking it in at once. */}
      <div className="mt-4 flex flex-1 flex-wrap content-start gap-x-4 gap-y-2.5">
        {top.map((genre, i) => (
          <div key={genre.name} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${GENRE_BAR[i]}`} />
            <span className="text-sm text-ink-200">{genre.name}</span>
            <span className="font-mono text-xs text-ink-400 tabular-nums">
              {Math.round((genre.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export type RatingCard = {
  id: string;
  mediaType: string;
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number;
  review: string | null;
};

/**
 * Your verdicts, as a rail of posters.
 *
 * This was a two-column grid of cards with the review text in each. That is fine
 * at a dozen ratings and unusable at two hundred — the section grew without
 * limit and buried everything under it. A rail is a fixed height whatever the
 * count: it scrolls sideways, it shows the newest first, and the number in the
 * header says how many there are in total.
 *
 * The review text is gone from here on purpose. It belongs on the title it is
 * about, where there is room to read it, and a three-line clamp in a grid cell
 * was never actually read.
 */
export function RatingsRail({ ratings, total }: { ratings: RatingCard[]; total: number }) {
  if (ratings.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
            Your verdicts
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Ratings and reviews</h2>
        </div>
        <span className="font-mono text-xs text-ink-400">
          {total.toLocaleString("en-GB")} rated
        </span>
      </div>

      <Rail>
        {ratings.map((rating) => {
          const poster = img.poster(rating.poster, "w342");

          return (
            <Link
              key={rating.id}
              href={`/title/${rating.mediaType}/${rating.tmdbId}`}
              title={rating.title}
              className="rail-item group w-[108px] sm:w-[128px]"
            >
              <div className="relative aspect-2/3 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
                {poster && (
                  <Image
                    src={poster}
                    alt=""
                    fill
                    sizes="128px"
                    className="object-cover md:transition md:duration-500 md:group-hover:scale-105"
                  />
                )}
                <span className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
                  <ScoreBadge score={rating.score} />
                  {rating.review && (
                    <span
                      title="You wrote a review"
                      className={`${OVERLAY_MARK} text-white`}
                    >
                      <PenLine size={11} />
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-medium">{rating.title}</p>
            </Link>
          );
        })}
      </Rail>
    </section>
  );
}

/** The titles put on most often, films and shows together. */
export function MostWatchedPanel({ items }: { items: MostWatched[] }) {
  if (items.length === 0) return null;

  const peak = Math.max(...items.map((item) => item.plays));

  return (
    <section className="card p-5">
      <PanelHead eyebrow="On repeat" title="Most watched" />

      {/*
        The hours belong on the caption line, not in a column of their own at
        the end of the bar. The bar is drawn from `plays`, which is what the
        ranking is, and a number sitting at the end of a bar reads as that bar's
        value — so a 279-episode sitcom got a longer bar than a 228-episode
        drama while showing fewer hours beside it, and the panel looked broken.
        On the caption line the hours are plainly a second fact about the row.
      */}
      <ul className="mt-4 divide-y divide-ink-800/70">
        {items.map((item, index) => {
          const poster = img.poster(item.poster, "w185");

          return (
            <li key={item.key}>
              <Link
                href={`/title/${item.mediaType}/${item.tmdbId}`}
                className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-ink-800/40 sm:gap-4"
              >
                <span className="w-5 shrink-0 text-center font-mono text-lg font-black text-ink-700 tabular-nums">
                  {index + 1}
                </span>

                <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-ink-800">
                  {poster && (
                    <Image src={poster} alt="" fill sizes="40px" className="object-cover" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block text-xs text-ink-400">
                    {/* Different units for the two kinds, said out loud rather
                        than left as a bare number the reader has to guess at. */}
                    {item.mediaType === "tv"
                      ? `${item.plays} episode${item.plays === 1 ? "" : "s"}`
                      : `${item.plays} viewing${item.plays === 1 ? "" : "s"}`}
                    <span className="text-ink-500"> · </span>
                    <span className="font-mono tabular-nums">{formatHours(item.minutes)}</span>
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink-800">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400"
                      style={{ width: `${Math.max(4, (item.plays / peak) * 100)}%` }}
                    />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
