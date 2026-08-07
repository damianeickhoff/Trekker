import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Bookmark,
  ChevronDown,
  Dices,
  Gem,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { formatSpan } from "@/lib/format";
import { img, tmdbConfigured } from "@/lib/tmdb";
import { findPicks, todaySeed, type Pick } from "@/lib/what-to-watch";
import { readAnswers, toQuery, type QuestionId } from "@/lib/what-to-watch-quiz";
import { MediaCard, OVERLAY_PILL, ScoreBadge } from "@/components/media-card";
import { SavePickButton } from "@/components/save-pick-button";
import { EmptyState, SetupNotice } from "@/components/ui";

export const metadata = { title: "Tonight's pick · Trekker" };

type Search = { who?: string; vibe?: string; kind?: string; time?: string; roll?: string };

/** What each of the three is called, in the order they are ranked. */
const RANKS = ["Tonight's pick", "Second choice", "Third choice"];

export default async function WhatToWatchResults({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const params = await searchParams;
  const { audience, vibe, kind, time, next } = readAnswers(params);

  // Arrived here with a question still unanswered — a hand-edited link, or a
  // stale bookmark from before an option was renamed. Go and ask it.
  if (next !== null || !audience || !vibe || !kind || !time) {
    redirect(`/discover/what-to-watch?${toQuery(params)}`);
  }

  // The seed moves on its own once a day, so the same four answers on Friday
  // and on Saturday are not the same evening. `roll` pins it, which is what
  // makes a refresh — or coming back from a title page — show the same picks.
  const roll = Number(params.roll);
  const seed = Number.isFinite(roll) && roll > 0 ? Math.floor(roll) : todaySeed();

  const answers = {
    who: audience.value,
    vibe: vibe.value,
    kind: kind.value,
    time: time.value,
  };

  const picks = await findPicks(user.id, answers, seed);

  /*
   * Every answer chip is a link back to the question that produced it, with the
   * answers *after* it dropped. The first version of this page had a single
   * "change answers" button pointing at the wizard with all four answers still
   * in the URL — which the wizard read as a finished run and bounced straight
   * back here. A page that quietly refuses to open is worse than no button.
   */
  const upTo = (last: QuestionId | null): string => {
    const kept: Partial<Record<QuestionId, string>> = {};
    if (last === null) return "/discover/what-to-watch";
    kept.who = answers.who;
    if (last !== "who") kept.vibe = answers.vibe;
    if (last !== "who" && last !== "vibe") kept.kind = answers.kind;
    return `/discover/what-to-watch?${toQuery(kept)}`;
  };

  const chips: { emoji: string; label: string; href: string }[] = [
    { emoji: audience.emoji, label: audience.label, href: upTo(null) },
    { emoji: vibe.emoji, label: vibe.label, href: upTo("who") },
    { emoji: kind.emoji, label: kind.label, href: upTo("vibe") },
    { emoji: time.emoji, label: time.label, href: upTo("kind") },
  ];

  const again = `/discover/what-to-watch/results?${toQuery(answers, { roll: seed + 1 })}`;

  return (
    <div className="rise">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium tracking-[0.2em] text-flare-400 uppercase">
            {audience.eyebrow}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            Here is what to watch
          </h1>
        </div>

        <Link
          href="/discover"
          aria-label="Close and go back to discover"
          className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink-700 text-ink-400 transition hover:border-flare-500 hover:text-flare-400"
        >
          <X size={16} />
        </Link>
      </div>

      {/* Each one changes that answer. Tapping "Romantic & warm" re-asks the
          mood question with everything before it still filled in, which is what
          "change answers" actually means most of the time. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.label}
            href={chip.href}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1 text-xs text-ink-300 transition hover:border-flare-500 hover:text-ink-100 light:bg-white/70"
          >
            <span aria-hidden>{chip.emoji}</span>
            {chip.label}
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link
          href="/discover/what-to-watch"
          className="inline-flex items-center gap-1.5 text-sm text-flare-400 transition hover:text-flare-500"
        >
          <RotateCcw size={14} />
          Start over
        </Link>

        {!picks.empty && (
          <Link
            href={again}
            scroll={false}
            className="inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100"
          >
            <Dices size={14} />
            Show me another set
          </Link>
        )}
      </div>

      {picks.empty ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing quite fit"
            body="That combination came back empty. Try a different mood, or give yourself a bit more time."
            href={upTo("who")}
            cta="Pick another mood"
          />
        </div>
      ) : (
        <>
          {picks.top[0] && <Hero pick={picks.top[0]} />}

          {(picks.top.length > 1 || picks.wildcard) && (
            <div className="mt-4 space-y-3">
              {picks.top.slice(1).map((pick, index) => (
                <Runner key={keyOf(pick)} pick={pick} label={RANKS[index + 1] ?? "Also worth a look"} />
              ))}

              {picks.wildcard && (
                <Runner
                  pick={picks.wildcard}
                  label="Wildcard"
                  note="The best reviewed thing that matches"
                  wild
                />
              )}
            </div>
          )}

          {picks.others.length > 0 && <Others picks={picks.others} />}

          {picks.noProviders && (
            <p className="mt-8 text-xs text-ink-500">
              Tell Trekker which services you pay for in{" "}
              <Link href="/settings" className="text-flare-400 hover:text-flare-500">
                settings
              </Link>{" "}
              and it will push what you can actually play tonight to the top.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function keyOf(pick: Pick) {
  return `${pick.item.mediaType}-${pick.item.id}`;
}

/** What the save button needs, which is rather less than a media card does. */
function saveable(pick: Pick) {
  return {
    mediaType: pick.item.mediaType,
    tmdbId: pick.item.id,
    title: pick.item.title,
    poster: pick.item.poster,
    score: pick.item.score || null,
  };
}

/**
 * The winner, on its own artwork.
 *
 * It gets a shape nothing else on the page has, and deliberately so: the whole
 * point of asking four questions was to end up with *one* answer, and four
 * equal cards in a row would put the viewer straight back where they started.
 */
function Hero({ pick }: { pick: Pick }) {
  const { item } = pick;
  const art = img.backdrop(item.backdrop, "w1280") ?? img.poster(item.poster, "w780");

  return (
    <section className="mt-6">
      <Link
        href={`/title/${item.mediaType}/${item.id}`}
        className="group block overflow-hidden rounded-2xl border border-flare-500/40 bg-ink-900/60 transition hover:border-flare-500"
      >
        <div className="relative aspect-video w-full overflow-hidden bg-ink-800">
          {art && (
            <Image
              src={art}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 900px"
              priority
              className="object-cover md:transition md:duration-700 md:group-hover:scale-105"
            />
          )}
          <div className="absolute inset-0 scrim-full" />

          {/* The match moved up here off the artwork.
              `flare-300` is inverted in light mode — it becomes a *dark*
              violet, so it can sit on a pale card — but the scrim over a poster
              is deliberately dark in both themes. Dark violet on near-black is
              what made it unreadable, and no amount of scrim would have fixed
              it. On the plate, in white, it is legible over anything. */}
          <span
            className={`absolute top-3 left-3 tracking-[0.16em] text-white uppercase ${OVERLAY_PILL}`}
          >
            <Sparkles size={11} />
            {RANKS[0]}
            <span className="font-mono tracking-normal tabular-nums opacity-70">
              {pick.match}%
            </span>
          </span>

          <span className="absolute top-3 right-3">
            <ScoreBadge score={item.score} />
          </span>

          <div className="absolute inset-x-4 bottom-4">
            <h2 className="text-2xl font-semibold tracking-tight text-balance text-white sm:text-3xl">
              {item.title}
            </h2>
          </div>
        </div>
      </Link>

      <div className="mt-3">
        <Chips pick={pick} />
        <p className="mt-2.5 text-sm text-ink-300">{pick.reason}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <SavePickButton item={saveable(pick)} initialSaved={pick.onWatchlist} />
          {meta(pick) && <p className="text-xs text-ink-400">{meta(pick)}</p>}
        </div>
      </div>
    </section>
  );
}

/** Second, third, and the wildcard: a row each. */
function Runner({
  pick,
  label,
  note,
  wild = false,
}: {
  pick: Pick;
  label: string;
  /** One line saying what this slot is for, when that is not obvious. */
  note?: string;
  /** The wildcard wears gold rather than violet — it answers a different question. */
  wild?: boolean;
}) {
  const { item } = pick;
  const poster = img.poster(item.poster, "w185");

  return (
    <div
      className={`card group relative flex gap-3.5 p-3 transition hover:bg-ink-800/50 ${
        wild ? "border-ember-500/40 hover:border-ember-400" : "hover:border-flare-500"
      }`}
    >
      {/*
        Three classes here are all load-bearing, and each one fixes a different
        way this box stopped being 2:3.

        `block`, because an anchor is inline by default and `aspect-ratio` does
        nothing to an inline box. `self-start`, because a flex item stretches to
        the row's height by default — which is set by the text column beside it
        — and that stretch silently overrides the height the aspect ratio would
        have produced. `object-cover` then fills a box that is genuinely 2:3,
        the same shape as the poster, so it fills it exactly without cropping.

        Get any one of them wrong and the artwork is squashed, letterboxed, or
        cropped down the sides, which is precisely the sequence this went
        through before landing here.
      */}
      <Link
        href={`/title/${item.mediaType}/${item.id}`}
        className="relative block aspect-2/3 w-[104px] shrink-0 self-start overflow-hidden rounded-lg bg-ink-800 sm:w-[124px]"
      >
        {poster && (
          <Image
            src={poster}
            alt=""
            fill
            sizes="(max-width: 640px) 104px, 124px"
            className="object-cover"
          />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        {/* The rank, the length and the save button all share the top line.
            They were spread over the top and bottom of the card before, which
            cost a whole row of height to say three short things. */}
        <div className="flex items-center gap-2">
          <p
            className={`flex min-w-0 flex-1 items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] uppercase ${
              wild ? "text-ember-400" : "text-flare-400"
            }`}
          >
            {wild && <Gem size={11} className="shrink-0" />}
            <span className="truncate">{label}</span>
            <span className="font-mono tracking-normal text-ink-400">{pick.match}%</span>
          </p>

          {meta(pick) && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-400">
              {meta(pick)}
            </span>
          )}

          <SavePickButton item={saveable(pick)} initialSaved={pick.onWatchlist} compact />
        </div>

        <Link href={`/title/${item.mediaType}/${item.id}`} className="block">
          <h3 className="mt-1 line-clamp-1 text-base font-semibold tracking-tight">
            {item.title}
          </h3>
        </Link>

        {note && <p className="mt-0.5 text-[11px] text-ink-500">{note}</p>}

        <div className="mt-1.5">
          <Chips pick={pick} />
        </div>

        <p className="mt-2 line-clamp-3 text-xs text-ink-300 sm:line-clamp-2">{pick.reason}</p>
      </div>
    </div>
  );
}

/**
 * The rest, folded away.
 *
 * A `<details>` rather than a toggle in client state: it costs no JavaScript,
 * survives a refresh with the page, and the open/closed state is something the
 * browser has always known how to do.
 */
function Others({ picks }: { picks: Pick[] }) {
  return (
    <details className="group mt-8">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-xl border border-ink-600/70 bg-ink-900/70 px-4 py-2.5 text-sm font-medium text-ink-100 transition hover:border-flare-500 light:border-ink-600 light:bg-white/85 [&::-webkit-details-marker]:hidden">
        <ChevronDown
          size={16}
          className="transition-transform duration-200 group-open:rotate-180"
        />
        Show other options
        <span className="text-ink-400">({picks.length})</span>
      </summary>

      <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-5">
        {picks.map((pick) => (
          <div key={keyOf(pick)}>
            <MediaCard item={pick.item} />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-mono text-[10px] tabular-nums text-ink-500">
                {pick.match}% match
              </p>
              <SavePickButton item={saveable(pick)} initialSaved={pick.onWatchlist} compact />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

/** The little truths worth stating outright rather than burying in a sentence. */
function Chips({ pick }: { pick: Pick }) {
  const chip =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {pick.streamingNow && (
        <span className={`${chip} border-fresh-500/40 bg-fresh-500/10 text-fresh-500`}>
          <Play size={9} fill="currentColor" />
          Available now
        </span>
      )}
      {pick.onWatchlist && (
        <span className={`${chip} border-flare-500/40 bg-flare-500/10 text-flare-400`}>
          <Bookmark size={9} />
          On your watchlist
        </span>
      )}
      {pick.partway && (
        <span className={`${chip} border-ember-500/40 bg-ember-500/10 text-ember-400`}>
          <Star size={9} />
          Carry on watching
        </span>
      )}
      <span className={`${chip} border-ink-600/70 text-ink-400`}>
        {pick.item.mediaType === "tv" ? "Show" : "Movie"}
      </span>
    </div>
  );
}

/**
 * How long it is, and nothing else.
 *
 * This used to carry the year and the score too, until the reason line started
 * describing the title in prose — "A comedy with a drama edge from 1994, adored
 * at 85%" directly above "1994 · 85% audience" is the same sentence twice. The
 * runtime is the one fact the prose does not reliably reach.
 *
 * A show's runtime is one episode, not the whole thing, so it has to say so —
 * "45m" under a series that runs for six seasons is simply a lie.
 */
function meta(pick: Pick) {
  if (!pick.runtime) return "";

  return pick.item.mediaType === "tv"
    ? `${formatSpan(pick.runtime)} an episode`
    : formatSpan(pick.runtime);
}
