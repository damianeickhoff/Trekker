import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Film, Tv } from "lucide-react";
import { relativeDay, type CalendarEntry, type CalendarTag } from "@/lib/calendar";
import { img } from "@/lib/images";
import { OVERLAY_PILL } from "./media-card";
import { Rail } from "./rail";
import { SectionTitle } from "./ui";

// Fixed plates rather than theme tokens: these sit on artwork, which does not
// change with the theme.
const TAG_LABEL: Record<CalendarTag, string> = {
  "series-premiere": "Premiere",
  "season-premiere": "Premiere",
  "season-finale": "Season finale",
  finale: "Finale",
};

const TAG_DOT: Record<CalendarTag, string> = {
  "series-premiere": "bg-fresh-500",
  "season-premiere": "bg-fresh-500",
  "season-finale": "bg-ember-400",
  finale: "bg-red-500",
};

/**
 * "What is landing soon" for the dashboard. Wide artwork rather than posters:
 * the home page is already a wall of poster rails, and a backdrop gives the
 * episode title somewhere to sit.
 */
export function UpcomingRail({
  entries,
  today,
}: {
  entries: CalendarEntry[];
  today: string;
}) {
  if (entries.length === 0) return null;

  return (
    <>
      <SectionTitle href="/calendar" cta="Full calendar">
        Landing soon
      </SectionTitle>
      <Rail>
        {entries.map((entry, index) => (
          <UpcomingCard key={entry.key} entry={entry} today={today} index={index} />
        ))}
      </Rail>
    </>
  );
}

function UpcomingCard({
  entry,
  today,
  index,
}: {
  entry: CalendarEntry;
  today: string;
  index: number;
}) {
  // Falls back to the poster so a title with no backdrop still shows artwork.
  const art = img.backdrop(entry.backdrop, "w780") ?? img.poster(entry.poster, "w500");
  const Icon = entry.mediaType === "tv" ? Tv : Film;
  const when = relativeDay(entry.date, today);

  return (
    <Link
      href={`/title/${entry.mediaType}/${entry.tmdbId}`}
      title={`${entry.title} — ${entry.detail}`}
      className="rail-item fade-in group w-[300px] sm:w-[360px]"
      style={{ "--fade-delay": `${index * 60}ms` } as React.CSSProperties}
    >
      <div className="relative aspect-16/9 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
        {art ? (
          <Image
            src={art}
            alt=""
            fill
            sizes="(min-width: 640px) 360px, 300px"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-ink-600">
            <Icon size={26} />
          </div>
        )}

        <div className="scrim-b absolute inset-0" />

        {/* Two chips of the same weight. They sit side by side and say two parts
            of one sentence — when it lands, and what it is — so a difference in
            size or colour between them read as a hierarchy that is not there. */}
        <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-1.5">
          <span className={`${OVERLAY_PILL} text-white`}>
            <CalendarDays size={11} />
            {when}
          </span>
          {entry.tag && (
            <span className={`${OVERLAY_PILL} text-white`}>
              <span className={`h-1.5 w-1.5 rounded-full ${TAG_DOT[entry.tag]}`} />
              {TAG_LABEL[entry.tag]}
            </span>
          )}
        </div>

        <div className="absolute inset-x-3 bottom-2.5">
          <p className="line-clamp-1 text-sm font-semibold text-white drop-shadow">
            {entry.title}
          </p>
          <p className="line-clamp-1 text-xs text-white/70">{entry.detail}</p>
        </div>
      </div>
    </Link>
  );
}
