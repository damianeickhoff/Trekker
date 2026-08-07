import Image from "next/image";
import Link from "next/link";
import { Film, RotateCcw, Tv } from "lucide-react";
import type { ActivityEntry } from "@/lib/social";
import { img } from "@/lib/images";
import { OVERLAY_PILL } from "./media-card";
import { Rail } from "./rail";

function ago(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * What friends have been watching, in the same wide format as "Landing soon".
 *
 * Both rails answer "what is happening" rather than "what could I watch", and a
 * poster grid was the wrong shape for that: an episode's own still says far more
 * about a night's viewing than the show's poster, which is identical whichever
 * episode they watched.
 */
export function ActivityRail({
  entries,
  showWho = true,
}: {
  entries: ActivityEntry[];
  showWho?: boolean;
}) {
  return (
    <Rail>
      {entries.map((entry, index) => (
        <ActivityCard key={entry.key} entry={entry} showWho={showWho} index={index} />
      ))}
    </Rail>
  );
}

function ActivityCard({
  entry,
  showWho,
  index,
}: {
  entry: ActivityEntry;
  showWho: boolean;
  index: number;
}) {
  // `image` is already the right shape — an episode still or a film backdrop —
  // and both are served from the same size prefix, so one builder covers them.
  // The poster is the last resort, blurred, because a 2:3 image stretched into a
  // 16:9 frame is worse than no detail at all.
  const art = img.backdrop(entry.image, "w780") ?? img.poster(entry.poster, "w500");
  const Icon = entry.kind === "episode" ? Tv : Film;

  return (
    <Link
      href={entry.href}
      title={`${entry.title} — ${entry.subtitle}`}
      className="rail-item fade-in group w-[248px] sm:w-[288px]"
      style={{ "--fade-delay": `${index * 60}ms` } as React.CSSProperties}
    >
      <div className="relative aspect-16/9 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
        {art ? (
          <Image
            src={art}
            alt=""
            fill
            sizes="288px"
            className={`object-cover transition duration-500 group-hover:scale-105 ${
              entry.image ? "" : "blur-sm"
            }`}
          />
        ) : (
          <div className="grid h-full place-items-center text-ink-600">
            <Icon size={26} />
          </div>
        )}

        <div className="scrim-b absolute inset-0" />

        <div className="absolute inset-x-2 top-2 flex flex-wrap items-center gap-1.5">
          {showWho && (
            <span className={`${OVERLAY_PILL} pr-2.5 pl-1 text-white`}>
              <span className="grid h-4 w-4 shrink-0 place-items-center overflow-hidden rounded-full bg-flare-600 text-[8px] font-bold text-white">
                {entry.userAvatar ? (
                  <Image
                    src={entry.userAvatar}
                    alt=""
                    width={16}
                    height={16}
                    className="h-4 w-4 object-cover"
                    unoptimized
                  />
                ) : (
                  entry.userName.slice(0, 1).toUpperCase()
                )}
              </span>
              {entry.userName}
            </span>
          )}

          <span className={`${OVERLAY_PILL} text-white`}>
            <Icon size={11} />
            {ago(entry.watchedAt)}
          </span>

          {entry.isRewatch && (
            <span className={`${OVERLAY_PILL} text-white`}>
              <RotateCcw size={11} className="text-flare-400" />
              Again
            </span>
          )}
        </div>

        <div className="absolute inset-x-3 bottom-2.5">
          <p className="line-clamp-1 text-sm font-semibold text-white drop-shadow">
            {entry.title}
          </p>
          <p className="line-clamp-1 text-xs text-white/70">{entry.subtitle}</p>
        </div>
      </div>
    </Link>
  );
}
