import Link from "next/link";
import { Bookmark, Heart, ListChecks, Sparkles } from "lucide-react";
import type { ListView } from "@/lib/lists";
import { formatWatched } from "@/lib/dates";
import { ListMenu } from "./list-menu";
import { MediaCard, type WatchStatus } from "./media-card";
import { Rail } from "./rail";

/**
 * One list, as a row.
 *
 * Every list on the overview gets the same treatment — heading, one line of
 * explanation, a scroller of posters — because the point of that page is to
 * show what you have at a glance, and a watchlist rendered differently from a
 * smart list would make the reader work out which is which before reading
 * either. The icon by the name is what tells them apart.
 */

/**
 * The glyph and the colour each kind of list wears, wherever it is named.
 *
 * Exported because the two rails on the lists page are different components —
 * one shows titles, the other shows lists — and a heading that looked different
 * depending on which component happened to draw it would be a bug you could see.
 */
export const LIST_ICONS = {
  watchlist: Bookmark,
  favourites: Heart,
  manual: ListChecks,
  smart: Sparkles,
} as const;

export const LIST_TINTS = {
  watchlist: "text-flare-400",
  favourites: "text-rose-400",
  manual: "text-ink-300",
  smart: "text-fresh-500",
} as const;

export function ListRail({
  list,
  requests,
  statuses,
  empty,
  action,
}: {
  list: ListView;
  requests?: Map<string, "pending" | "partial" | "available">;
  statuses?: Map<string, WatchStatus>;
  /** What to say instead of an empty scroller. */
  empty?: React.ReactNode;
  /**
   * A control belonging to this list in particular. It sits on the list's own
   * heading rather than at the top of the page, because a button floating above
   * four rails reads as applying to all of them — "Pick for me" only ever
   * reaches into the watchlist.
   */
  action?: React.ReactNode;
}) {
  const Icon = LIST_ICONS[list.kind];

  return (
    <section className="mt-8 first:mt-6">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon size={17} className={`shrink-0 ${LIST_TINTS[list.kind]}`} />
            <Link href={list.href} className="truncate transition hover:text-flare-400">
              {list.name}
            </Link>
          </h2>
          <p className="mt-0.5 truncate text-sm text-ink-400">{list.description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Only worth a link once there is more behind it than the rail shows. */}
          {list.count > list.items.length && (
            <Link
              href={list.href}
              className="rounded-lg px-2 py-1 text-sm whitespace-nowrap text-flare-400 transition hover:text-flare-500"
            >
              See all {list.count}
            </Link>
          )}
          {action}
          {(list.kind === "manual" || list.kind === "smart") && (
            <ListMenu listId={list.id} name={list.name} kind={list.kind} />
          )}
        </div>
      </div>

      {list.items.length === 0 ? (
        <div className="card px-5 py-8 text-center text-sm text-ink-400">
          {empty ?? "Nothing on this list yet."}
        </div>
      ) : (
        <Rail>
          {list.items.map((item) => (
            <MediaCard
              key={`${item.mediaType}-${item.id}`}
              item={item}
              status={statuses?.get(`${item.mediaType}-${item.id}`)}
              request={requests?.get(`${item.mediaType}-${item.id}`)}
              className="rail-item w-[132px] sm:w-[160px]"
            />
          ))}
        </Rail>
      )}

      {/* Only smart lists have a refresh to report, and only once one has run. */}
      {list.kind === "smart" && list.refreshedAt && (
        <p className="mt-2 text-[11px] text-ink-500">
          Rebuilt {formatWatched(list.refreshedAt)} · updates itself daily
        </p>
      )}
    </section>
  );
}
