import Image from "next/image";
import Link from "next/link";
import {
  Check,
  CloudDownload,
  Download,
  Film,
  HardDriveDownload,
  Hourglass,
  Play,
  Tv,
} from "lucide-react";
import { img } from "@/lib/images";
import type { NormalisedItem } from "@/lib/tmdb";
import { Rail } from "./rail";

/**
 * The one plate every overlay on artwork sits on.
 *
 * Exported because there are five of these across the app — the score, the two
 * corner marks, the calendar chips and the activity chips — and every time one
 * was written by hand it drifted a little from the others. Importing it is what
 * stops that happening again: change this line and all five move together.
 */
export const OVERLAY_SHAPE = "rounded-full border backdrop-blur-xs";

export const OVERLAY_PLATE = `${OVERLAY_SHAPE} border-white/20 bg-white/10`;

/** A chip with words in it. */
export const OVERLAY_PILL = `inline-flex h-6 items-center gap-1.5 px-2.5 text-[10px] font-bold ${OVERLAY_PLATE}`;

/** A chip with a single glyph in it, sized to match the pill's height. */
export const OVERLAY_MARK = `grid h-6 w-6 place-items-center ${OVERLAY_PLATE}`;

/**
 * The score's own plate, tinted by the band it falls in.
 *
 * Built from `OVERLAY_SHAPE` rather than by overriding `OVERLAY_PLATE`: two
 * competing `bg-*` classes in one string resolve by stylesheet order, not by
 * which was written last, so "override it afterwards" is a coin toss. Composing
 * from the uncoloured shape is the only version that reliably wins.
 */
const SCORE_PLATE = {
  good: "border-emerald-300/50 bg-emerald-500/35",
  fair: "border-amber-300/50 bg-amber-500/35",
  poor: "border-red-300/50 bg-red-500/35",
} as const;

/**
 * The plate for a 0-100 score. Exported so the hero's score row can wear the
 * same three bands as the pill on the poster — they are the same judgement and
 * a viewer should not have to learn two colour schemes for it.
 *
 * `fair` and `good` are thresholds rather than constants because Metacritic
 * calls 61 good and 40 mixed, where TMDB's audience score does not.
 */
export function scorePlate(score: number, fair = 50, good = 70) {
  return score >= good ? SCORE_PLATE.good : score >= fair ? SCORE_PLATE.fair : SCORE_PLATE.poor;
}

/**
 * The three bands as a text colour, for a score written as plain type rather
 * than worn as a plate — the Plex strip's percentage beside a title. Exported so
 * that "what counts as good" is decided in one place: a number that is amber on
 * a poster and green on a strip is two different judgements of the same film.
 */
export function scoreTone(score: number) {
  return score >= 70
    ? "text-emerald-400 light:text-emerald-700"
    : score >= 50
      ? "text-amber-400 light:text-amber-700"
      : "text-red-400 light:text-red-700";
}

/** The pill itself, minus the plate — see `scorePlate`. */
export const SCORE_PILL = `inline-flex h-6 items-center gap-1.5 px-2.5 text-[10px] font-bold tabular-nums text-white ${OVERLAY_SHAPE}`;

export function ScoreBadge({
  score,
  className = "",
  variant = "overlay",
}: {
  score: number;
  className?: string;
  /**
   * `overlay` sits on artwork and needs its own dark plate. `outline` matches
   * the bordered chips used for the critic scores and genres, so a row of them
   * reads as one set rather than two competing styles.
   */
  variant?: "overlay" | "outline";
}) {
  // Nothing rated yet: show nothing rather than an empty placeholder.
  if (!score) return null;

  const tone = scoreTone(score);

  if (variant === "outline") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-ink-600/70 bg-ink-900/70 px-2.5 py-1 text-[11px] backdrop-blur-sm light:border-ink-600 light:bg-white/80 ${className}`}
        title="Average audience score"
      >
        <span className="text-ink-300">Audience</span>
        <span className={`font-mono font-semibold tabular-nums ${tone}`}>{score}%</span>
      </span>
    );
  }

  // The one overlay that carries its colour in the plate rather than the glyph.
  // It can afford to: the corner marks all mean different things and need the
  // colour to say which, whereas this always means the same thing and only the
  // *value* changes — so tinting the chip reads the score from further away
  // than a coloured number on a white pane ever did.
  const plate = score >= 70 ? SCORE_PLATE.good : score >= 50 ? SCORE_PLATE.fair : SCORE_PLATE.poor;

  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 px-2.5 text-[10px] font-bold tabular-nums text-white ${OVERLAY_SHAPE} ${plate} ${className}`}
      title="Average audience score"
    >
      {score}%
    </span>
  );
}

export type WatchStatus =
  /** A movie you have logged, or a show you have finished for good. */
  | "watched"
  | "completed"
  /** Caught up, but the show is still running. */
  | "up-to-date"
  /** Released episodes are waiting. */
  | "continue";

/**
 * The corner marks — same plate as everything else on the artwork, so the only
 * thing telling them apart is the glyph.
 *
 * Those glyphs are all open shapes: a tick, a triangle, an hourglass, an arrow.
 * Anything already drawn inside a ring of its own (`Clock`, `CircleCheck`) ends
 * up as a circle within a circle at this size, which reads as a mistake rather
 * than a design.
 */
const BADGE = OVERLAY_MARK;

export function StatusMark({ status }: { status: WatchStatus }) {
  // Finished for good: a plain tick, same for movies and shows.
  if (status === "watched" || status === "completed") {
    return (
      <span
        title={status === "watched" ? "Watched" : "Completed"}
        className={`absolute top-2 left-2 text-white ${BADGE}`}
      >
        <Check size={13} strokeWidth={3} />
      </span>
    );
  }

  const isContinue = status === "continue";

  return (
    <span
      title={isContinue ? "Released episodes to watch" : "Caught up, more to come"}
      className={`absolute top-2 left-2 text-white ${BADGE}`}
    >
      {isContinue ? (
        <Play size={11} fill="currentColor" />
      ) : (
        <Hourglass size={12} strokeWidth={2.25} />
      )}
    </span>
  );
}

/**
 * What the *library* has, as opposed to what you have watched.
 *
 * Same plate and size as `StatusMark` in the opposite corner, because they are
 * a matched pair and one being smaller read as an afterthought. What separates
 * them is colour, and they share none: "available on the server" and "you have
 * seen it" are different facts about the same poster, so a green tick for one
 * beside a green tick for the other was simply ambiguous — and amber would have
 * collided with "episodes waiting" in the same way. The left corner owns
 * emerald, amber and violet; this one owns sky for on hand and a neutral slate
 * for merely asked for.
 */
const REQUEST_STATES = {
  pending: {
    title: "Requested — not here yet",
    tone: "text-white",
    icon: CloudDownload,
    size: 12,
  },
  partial: {
    title: "Partly available",
    tone: "text-white",
    icon: HardDriveDownload,
    size: 12,
  },
  available: {
    title: "Available to watch",
    tone: "text-white",
    icon: Download,
    size: 12,
  },
} as const;

export function RequestMark({ state }: { state: "pending" | "partial" | "available" }) {
  const { title, tone, icon: Icon, size } = REQUEST_STATES[state];

  return (
    <span title={title} className={`absolute top-2 right-2 ${BADGE} ${tone}`}>
      <Icon size={size} strokeWidth={2.5} />
    </span>
  );
}

export function MediaCard({
  item,
  status,
  request,
  className = "",
}: {
  item: NormalisedItem;
  status?: WatchStatus;
  /** Overseerr's state for this title, when there is anything to say. */
  request?: "pending" | "partial" | "available";
  className?: string;
}) {
  const src = img.poster(item.poster);
  const Icon = item.mediaType === "tv" ? Tv : Film;

  return (
    <Link
      href={`/title/${item.mediaType}/${item.id}`}
      className={`group block ${className}`}
      title={item.title}
    >
      <div className="relative aspect-2/3 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes="(max-width: 640px) 40vw, 180px"
            className="object-cover md:transition md:duration-500 md:group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-ink-600">
            <Icon size={28} />
          </div>
        )}

        {status && <StatusMark status={status} />}
        {request && <RequestMark state={request} />}

        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
          <ScoreBadge score={item.score} />
        </div>
      </div>

      <p className="mt-2 line-clamp-1 text-sm font-medium text-ink-100">{item.title}</p>
      <p className="ios-dim text-xs text-ink-400">
        {item.mediaType === "tv" ? "Show" : "Movie"}
        {item.year ? ` · ${item.year}` : ""}
      </p>
    </Link>
  );
}

export function CardRail({
  title,
  description,
  items,
  href,
  watchedIds,
  requests,
  className = "mt-4",
}: {
  title: string;
  /** One line under the heading, for rows whose point is not self-evident. */
  description?: string;
  items: NormalisedItem[];
  href?: string;
  /** Keys shaped `${mediaType}-${id}` → how far the viewer has got. */
  watchedIds?: Map<string, WatchStatus>;
  /** Same keys → Overseerr's state, for the corner mark. */
  requests?: Map<string, "pending" | "partial" | "available">;
  /** Overridable so rails grouped inside a band can sit closer together. */
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-400">{description}</p>}
        </div>
        {href && (
          <Link href={href} className="text-sm text-flare-400 hover:text-flare-500">
            See all
          </Link>
        )}
      </div>
      <Rail>
        {items.map((item) => (
          <MediaCard
            key={`${item.mediaType}-${item.id}`}
            item={item}
            status={watchedIds?.get(`${item.mediaType}-${item.id}`)}
            request={requests?.get(`${item.mediaType}-${item.id}`)}
            className="rail-item w-[152px] sm:w-[184px]"
          />
        ))}
      </Rail>
    </section>
  );
}
