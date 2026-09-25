"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { removeFromListAction, removeFromWatchlistAction } from "@/lib/list-actions";
import { titleHref } from "@/lib/marks";
import { Icon } from "../icon";
import { Link } from "../link";
import { ZOOM, ZOOM_GROUP, ZOOM_SHADOW, PRESS } from "../motion";
import { Poster } from "../poster";
import { useRecentPress } from "../exit-list";
import { EXIT, usePresence } from "../presence";
import { kindYear, PosterCaption, PosterFurniture } from "../poster-card";
import type { PosterItem } from "./tiles";

/*
 * A grid of posters with their titles under them: the watchlist and favourites
 * in full, and a list's own page. The remove button comes in two kinds. On a
 * manual list it is always there, as the mockup draws it. On the watchlist it
 * appears on hover, or after a long press on a phone, because the watchlist is
 * mostly for opening things and a cross on every poster invites mistakes. A
 * smart list has none: its titles are the answer to its filters, and one taken
 * off by hand would be back at the next rebuild.
 */

/**
 * The standard poster card in a grid: as many columns as fit at the card's
 * own width (`--poster-card`, 182px and 150px on phones), 9px apart, the
 * slack shared among them, so a grid poster is the rail poster or a little
 * more and never less.
 */
export const GRID = "grid grid-cols-[repeat(auto-fill,minmax(var(--poster-card),1fr))] gap-x-(--card-gap) gap-y-4 lg:gap-y-5";
const SIZES = "(min-width: 64rem) 200px, 50vw";

type Remove = { kind: "list"; listId: string } | { kind: "watchlist" };

export function TitleGrid({
  items,
  label,
  remove,
}: {
  items: PosterItem[];
  label: string;
  remove?: { mode: "always" | "hover"; target: Remove };
}) {
  // A title that turns up because of a press (added from the list's search) fades and rises in; none on first paint.
  const pressedLately = useRecentPress();
  const keyOf = (item: PosterItem) => `${item.mediaType}-${item.tmdbId}`;
  const [from, setFrom] = useState(items);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(items.map(keyOf)));
  const [arrived, setArrived] = useState<ReadonlySet<string>>(new Set());
  if (from !== items) {
    setFrom(items);
    const fresh = items.map(keyOf).filter((k) => !seen.has(k));
    if (fresh.length) {
      setSeen(new Set([...seen, ...fresh]));
      if (pressedLately()) setArrived(new Set([...arrived, ...fresh]));
    }
  }
  return (
    <div role="list" aria-label={label} className={GRID}>
      {items.map((item) => (
        <GridTile key={keyOf(item)} item={item} remove={remove} arriving={arrived.has(keyOf(item))} />
      ))}
    </div>
  );
}

const LONG_PRESS_MS = 500;

/**
 * The poster card's parts rather than `PosterCard` itself: the link here
 * carries the long press, and the cross stands beside it.
 */
function GridTile({ item, remove, arriving = false }: { item: PosterItem; remove?: { mode: "always" | "hover"; target: Remove }; arriving?: boolean }) {
  const [gone, setGone] = useState(false);
  const [armed, setArmed] = useState(false);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallowClick = useRef(false);
  const tile = useRef<HTMLDivElement>(null);

  // A press anywhere else puts an armed cross away again.
  useEffect(() => {
    if (!armed) return;
    const onDown = (e: PointerEvent) => {
      if (tile.current && !tile.current.contains(e.target as Node)) setArmed(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [armed]);

  // Taken off, it fades and shrinks away before the grid closes up (`motion-leave`).
  const { mounted, state } = usePresence(!gone, EXIT.fast);
  if (!mounted) return null;

  const hover = remove?.mode === "hover";
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  function drop() {
    if (!remove) return;
    setGone(true);
    startTransition(async () => {
      if (remove.target.kind === "list") await removeFromListAction(remove.target.listId, item.mediaType, item.tmdbId);
      else await removeFromWatchlistAction(item.mediaType, item.tmdbId);
    });
  }

  const crossVisible = remove && (remove.mode === "always" || armed);

  return (
    <div ref={tile} role="listitem" data-state={state} className={`motion-leave group ${ZOOM_GROUP} relative flex min-w-0 flex-col ${arriving ? "motion-rise-in" : ""}`}>
      <span className={`block rounded-[10px] ${ZOOM_SHADOW}`}>
      <Link
        href={titleHref(item.mediaType, item.tmdbId)}
        aria-label={item.title}
        className="relative block aspect-[182/274] overflow-hidden rounded-[10px] shadow-elevation [-webkit-touch-callout:none]"
        onPointerDown={
          hover
            ? (e) => {
                if (e.pointerType !== "touch") return;
                cancel();
                timer.current = setTimeout(() => {
                  swallowClick.current = true;
                  setArmed(true);
                }, LONG_PRESS_MS);
              }
            : undefined
        }
        onPointerUp={hover ? cancel : undefined}
        onPointerLeave={hover ? cancel : undefined}
        onPointerCancel={hover ? cancel : undefined}
        onContextMenu={hover ? (e) => e.preventDefault() : undefined}
        onClick={(e) => {
          // The press that armed the cross is not also a tap on the poster.
          if (swallowClick.current) {
            e.preventDefault();
            swallowClick.current = false;
          }
        }}
      >
        <Poster path={item.poster} alt="" title={item.title} width={200} height={300} sizes={SIZES} className={`size-full ${ZOOM}`} />
        <PosterFurniture score={item.score} mark={item.mark} />
      </Link>
      </span>
      {remove && (
        <button
          type="button"
          aria-label={`Remove ${item.title}`}
          onClick={drop}
          className={`${PRESS} absolute right-1.5 top-1.5 size-6 items-center justify-center rounded-full border-0 bg-black/55 p-0 text-white ${
            crossVisible ? "inline-flex" : "hidden group-hover:inline-flex group-focus-within:inline-flex"
          }`}
        >
          <Icon name="x" size={13} />
        </button>
      )}
      <PosterCaption title={item.title} meta={kindYear(item)} />
    </div>
  );
}
