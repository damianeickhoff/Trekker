import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus, ShieldCheck, X } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { tmdbConfigured } from "@/lib/tmdb";
import {
  AUDIENCES,
  KINDS,
  QUESTION_ORDER,
  readAnswers,
  timeQuestionFor,
  timesFor,
  toQuery,
  vibesFor,
  type Choice,
  type QuestionId,
} from "@/lib/what-to-watch-quiz";
import { SetupNotice } from "@/components/ui";

export const metadata = { title: "What to watch · Trekker" };

type Search = { who?: string; vibe?: string; kind?: string; time?: string; more?: string };

/**
 * Four questions, one page each.
 *
 * Every answer is a link rather than a click handler, which is what keeps this
 * a server component: the whole state of a half-finished run lives in the query
 * string, so the browser's back button walks back through the questions for
 * free, a refresh loses nothing, and there is no JavaScript involved in
 * answering any of them. Changing an earlier answer drops the ones after it,
 * since "who is watching" decides which moods are even on offer and "movie or
 * show" decides what the last question is.
 *
 * The whole thing is sized to the viewport rather than to its contents. Four
 * options stacked in a column left most of a phone screen empty below them,
 * which read as a page that had failed to load the rest of itself; spreading
 * the three bands over the available height fixes that without inventing
 * filler nobody asked for.
 */
export default async function WhatToWatchPage({
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
  const { audience, vibe, kind, next } = readAnswers(params);

  const answered: Partial<Record<QuestionId, string>> = {};
  if (audience) answered.who = audience.value;
  if (vibe) answered.vibe = vibe.value;
  if (kind) answered.kind = kind.value;

  // Every question answered: the search itself lives on its own route so it can
  // have a loading state of its own — it is several TMDB round trips deep.
  if (next === null) {
    redirect(`/discover/what-to-watch/results?${toQuery(params)}`);
  }

  const step = QUESTION_ORDER.indexOf(next);
  const total = QUESTION_ORDER.length;
  const showAllMoods = params.more === "1";

  // Where "back" goes: the previous question with its own answer cleared, so
  // arriving there re-asks it rather than bouncing straight forward again.
  const earlier: Partial<Record<QuestionId, string>> = {};
  for (const id of QUESTION_ORDER.slice(0, Math.max(step - 1, 0))) {
    const value = answered[id];
    if (value) earlier[id] = value;
  }

  const previous = step === 0 ? "/discover" : `/discover/what-to-watch?${toQuery(earlier)}`;

  const moods = audience ? vibesFor(audience, showAllMoods) : [];
  const hiddenMoods = audience ? audience.vibes.length - moods.length : 0;

  return (
    // The three bands — progress, question, footer — are spread over whatever
    // height is left under the header, so the options sit in the middle of the
    // screen rather than crowding its top edge.
    <div className="rise mx-auto flex min-h-[calc(100svh-13rem)] max-w-xl flex-col md:min-h-[calc(100svh-11rem)]">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Progress step={step} total={total} />
        </div>
        <Link
          href="/discover"
          aria-label="Close and go back to discover"
          className="-mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ink-700 text-ink-400 transition hover:border-flare-500 hover:text-flare-400"
        >
          <X size={15} />
        </Link>
      </div>

      <div className="flex flex-1 flex-col justify-center py-7">
        <div>
          {audience && (
            <p className="text-[11px] font-medium tracking-[0.2em] text-flare-400 uppercase">
              {audience.eyebrow}
            </p>
          )}
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {next === "who"
              ? "Who are you watching with tonight?"
              : next === "vibe"
                ? audience!.vibeQuestion
                : next === "kind"
                  ? "A movie, or a show?"
                  : timeQuestionFor(kind!.value)}
          </h1>
          {next === "time" && kind!.value === "tv" && (
            <p className="mt-1.5 text-sm text-ink-400">
              Episodes, not evenings — a series is as long as you let it be.
            </p>
          )}
        </div>

        <div className="mt-6">
          {next === "who" ? (
            <Tiles />
          ) : (
            <Rows
              question={next}
              answered={answered}
              options={
                next === "vibe" ? moods : next === "kind" ? KINDS : timesFor(kind!.value)
              }
            />
          )}
        </div>

        {/* Four moods is the right number to be shown; it is not always the
            right number to be offered. The rest are one link away rather than
            behind a scroll, and asking for them is a plain query parameter so
            the page stays static. */}
        {next === "vibe" && hiddenMoods > 0 && (
          <Link
            href={`/discover/what-to-watch?${toQuery(answered, { more: 1 })}`}
            scroll={false}
            className="mt-3 inline-flex items-center justify-center gap-1.5 self-center rounded-xl border border-dashed border-ink-600 px-4 py-2.5 text-sm text-ink-300 transition hover:border-flare-500 hover:text-flare-400"
          >
            <Plus size={15} />
            Show {hiddenMoods} more moods
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-ink-800 pt-4">
        <Link
          href={previous}
          className="inline-flex items-center gap-1 text-sm text-ink-400 transition hover:text-ink-100"
        >
          <ChevronLeft size={15} />
          {step === 0 ? "Discover" : "Back"}
        </Link>

        <p className="flex items-center gap-1.5 text-right text-xs text-ink-500">
          <ShieldCheck size={13} className="shrink-0" />
          Nothing is saved — this is just for tonight.
        </p>
      </div>
    </div>
  );
}

/** Where you are, as a bar and a row of dots. */
function Progress({ step, total }: { step: number; total: number }) {
  const done = Math.round(((step + 1) / total) * 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium tracking-[0.18em] text-ink-400 uppercase">
          Question {step + 1} of {total}
        </p>
        <p className="font-mono text-xs tabular-nums text-flare-400">{done}%</p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="How far through the questions you are"
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400 transition-[width] duration-500"
          style={{ width: `${done}%` }}
        />
      </div>

      <div aria-hidden className="mt-2.5 flex justify-center gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full transition ${
              i <= step ? "bg-flare-500" : "bg-ink-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** Where answering this option leads. Later answers are dropped by omission. */
function nextHref(
  question: QuestionId,
  value: string,
  answered: Partial<Record<QuestionId, string>>,
) {
  return `/discover/what-to-watch?${toQuery({ ...answered, [question]: value })}`;
}

/**
 * The first question, as a 2×2 of tiles.
 *
 * It gets a shape of its own because it is the one question whose answers are
 * *people* rather than settings — four faces on a grid is a much friendlier
 * opening than a fourth list of radio rows, and it is the only screen every
 * viewer will see.
 */
function Tiles() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {AUDIENCES.map((audience, index) => (
        <Link
          key={audience.value}
          // No answers carried in: this is the first question, and picking a
          // different audience invalidates every mood that came after it.
          href={nextHref("who", audience.value, {})}
          style={{ "--fade-delay": `${index * 60}ms` } as React.CSSProperties}
          className="card fade-in grid aspect-4/3 place-items-center gap-2 p-4 text-center transition hover:border-flare-500 hover:bg-ink-800/60 focus-visible:border-flare-500"
        >
          <span aria-hidden className="text-4xl leading-none sm:text-5xl">
            {audience.emoji}
          </span>
          <span className="text-sm font-semibold sm:text-base">{audience.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** Every other question: a stack of rows, each with the answer's own mark. */
function Rows({
  question,
  options,
  answered,
}: {
  question: QuestionId;
  options: Choice[];
  answered: Partial<Record<QuestionId, string>>;
}) {
  return (
    <div className="space-y-2.5">
      {options.map((option, index) => (
        <Link
          key={option.value}
          href={nextHref(question, option.value, answered)}
          // Capped, or a list of eight moods takes half a second to finish
          // arriving and the last two look broken on the way in.
          style={{ "--fade-delay": `${Math.min(index, 5) * 55}ms` } as React.CSSProperties}
          className="card fade-in group flex items-center gap-3.5 p-3.5 transition hover:border-flare-500 hover:bg-ink-800/60 focus-visible:border-flare-500"
        >
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center text-2xl">
            {option.emoji}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium sm:text-base">{option.label}</span>
            {option.hint && (
              <span className="mt-0.5 block text-xs text-ink-400">{option.hint}</span>
            )}
          </span>

          {/* The empty circle from a radio list, and nothing more: it says
              "pick one of these" at a glance, and the row is a link so there is
              never a checked state to draw. */}
          <span
            aria-hidden
            className="h-5 w-5 shrink-0 rounded-full border border-ink-600 transition group-hover:border-flare-500 group-hover:bg-flare-500/20"
          />
        </Link>
      ))}
    </div>
  );
}
