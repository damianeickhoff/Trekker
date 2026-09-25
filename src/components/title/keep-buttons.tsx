"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { requestNeedsConfirming } from "@/lib/providers";
import { setSaveTarget } from "@/lib/list-actions";
import { saveBehaviour, type SaveList } from "@/lib/save-behaviour";
import type { RecommendTarget } from "@/lib/recommend";
import {
  recommendTargetsFor,
  recommendTo,
  requestTitle,
  setFavourited,
  setOnWatchlist,
  setStopWatching,
} from "@/lib/title-actions";
import { Icon } from "../icon";
import { Link } from "../link";
import { Dialog, DialogTitle } from "../lists/dialog";
import { buttonClass } from "../ui";
import { UserAvatar } from "../user-avatar";
import { Presence } from "../presence";
import { MENU, MENU_ITEM, menuOrigin, usePopover } from "./popover";
import { PRESS } from "../motion";

type Title = { mediaType: "movie" | "tv"; tmdbId: number };

/*
 * The icon buttons after Mark watched, in the order the mockups fix: heart,
 * save, more. Each shows its new state at once and writes behind it.
 */

function useToggle(initial: boolean, write: (on: boolean) => Promise<void>) {
  const [on, setOn] = useOptimistic(initial);
  const [, startTransition] = useTransition();
  return [
    on,
    () =>
      startTransition(async () => {
        setOn(!on);
        await write(!on);
      }),
  ] as const;
}

/** The heart. Filling it pops it, 1 to 1.25 and back over `--base` (`motion-bump`); emptying it does not. */
export function FavouriteButton({ title, initial, className }: { title: Title; initial: boolean; className: string }) {
  const [on, toggle] = useToggle(initial, (next) => setFavourited(title.mediaType, title.tmdbId, next));
  // A new key for each fill, so the pop starts again; none on first paint.
  const [pops, setPops] = useState(0);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Favourite" : "Add to favourites"}
      onClick={() => {
        if (!on) setPops((n) => n + 1);
        toggle();
      }}
      className={className}
    >
      <span key={pops} className={`inline-flex [--bump:1.25] ${pops ? "motion-bump" : ""}`}>
        <Icon name="heart" size={20} className={`transition-colors duration-(--fast) ease-out ${on ? "fill-current text-accent" : ""}`} />
      </span>
    </button>
  );
}

/**
 * Save files a title; it never makes a list, which is done on the lists page
 * where you can see what you already have. With no lists of your own there is
 * nothing to choose between, so it is a plain watchlist toggle; with any, it
 * opens a small menu of the watchlist and each list, ticked where the title
 * already is. Without `lists` (the episode page) it is the toggle.
 */
export function SaveButton({
  title,
  initial,
  className,
  lists,
  menuClassName = "right-0",
}: {
  title: Title;
  initial: boolean;
  className: string;
  lists?: SaveList[];
  menuClassName?: string;
}) {
  if (saveBehaviour(lists) === "menu") {
    return <SaveMenu title={title} initial={initial} lists={lists!} className={className} menuClassName={menuClassName} />;
  }
  return <SaveToggle title={title} initial={initial} className={className} />;
}

function SaveToggle({ title, initial, className }: { title: Title; initial: boolean; className: string }) {
  const [on, toggle] = useToggle(initial, (next) => setOnWatchlist(title.mediaType, title.tmdbId, next));
  return (
    <button type="button" aria-pressed={on} aria-label={on ? "On your watchlist" : "Save to your watchlist"} onClick={toggle} className={className}>
      <Icon name="bookmark" size={20} className={on ? "fill-current" : ""} />
    </button>
  );
}

function SaveMenu({
  title,
  initial,
  lists,
  className,
  menuClassName,
}: {
  title: Title;
  initial: boolean;
  lists: SaveList[];
  className: string;
  menuClassName: string;
}) {
  const { open, setOpen, ref, shown, state } = usePopover();
  const start = { watchlist: initial, ...Object.fromEntries(lists.map((l) => [l.id, l.holds])) } as Record<string, boolean>;
  const [held, setHeld] = useOptimistic(start, (state, change: { id: string; on: boolean }) => ({ ...state, [change.id]: change.on }));
  const [, startTransition] = useTransition();
  const filed = Object.values(held).some(Boolean);
  // Rows flipped since the menu opened: only their tick pops in.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());

  function flip(id: string) {
    const next = !held[id];
    setFlipped((f) => new Set(f).add(id));
    startTransition(async () => {
      setHeld({ id, on: next });
      await setSaveTarget(id, title.mediaType, title.tmdbId, next);
    });
  }

  const rows = [{ id: "watchlist", name: "Watchlist", icon: "bookmark" as const }, ...lists.map((l) => ({ id: l.id, name: l.name, icon: "list" as const }))];
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={filed ? "Saved" : "Save"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        <Icon name="bookmark" size={20} className={filed ? "fill-current" : ""} />
      </button>
      {shown && (
        <div role="menu" aria-label="Save to" data-state={state} className={`${MENU} top-[calc(100%+8px)] max-h-80 w-64 overflow-y-auto ${menuClassName} ${menuOrigin(menuClassName)}`}>
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={Boolean(held[row.id])}
              onClick={() => flip(row.id)}
              className={MENU_ITEM}
            >
              <Icon name={row.icon} size={18} />
              <span className="min-w-0 grow truncate">{row.name}</span>
              <span
                aria-hidden="true"
                className={`inline-flex size-[22px] shrink-0 items-center justify-center rounded-full ${held[row.id] ? "bg-accent text-black" : "border-[1.5px] border-white/40"}`}
              >
                {held[row.id] && <Icon name="check" size={13} className={flipped.has(row.id) ? "motion-tick-in" : ""} />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "More": cast and crew, recommending to a friend, and for a show, stopping or
 * resuming. Stop watching is offered on shows only and is disabled on a
 * finished show watched to the end, where there is nothing left to be
 * reminded about.
 */
export function TitleMoreMenu({
  title,
  className,
  menuClassName = "right-0",
  stop,
  recommend = false,
}: {
  title: Title;
  className: string;
  menuClassName?: string;
  stop?: { dropped: boolean; allowed: boolean };
  /** Series and film pages; the episode page's menu is about the show, not this. */
  recommend?: boolean;
}) {
  const { open, setOpen, ref, shown, state } = usePopover();
  const [pending, startTransition] = useTransition();
  const [sheet, setSheet] = useState(false);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={className}>
        <Icon name="dots" size={20} />
      </button>
      {shown && (
        <div role="menu" data-state={state} className={`${MENU} top-[calc(100%+8px)] w-60 ${menuClassName} ${menuOrigin(menuClassName)}`}>
          <Link role="menuitem" href={`/title/${title.mediaType}/${title.tmdbId}/cast`} className={MENU_ITEM}>
            <Icon name="user" size={18} />
            Cast and crew
          </Link>
          {recommend && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setSheet(true);
              }}
              className={MENU_ITEM}
            >
              <Icon name="sparkle" size={18} />
              Recommend to a friend
            </button>
          )}
          {stop && (
            <button
              type="button"
              role="menuitem"
              disabled={pending || (!stop.dropped && !stop.allowed)}
              onClick={() =>
                startTransition(async () => {
                  await setStopWatching(title.tmdbId, !stop.dropped);
                  setOpen(false);
                })
              }
              className={MENU_ITEM}
            >
              <Icon name={stop.dropped ? "history" : "x"} size={18} />
              {stop.dropped ? "Start watching again" : stop.allowed ? "Stop watching" : "Finished, nothing to stop"}
            </button>
          )}
        </div>
      )}
      <Presence open={sheet}>
        <RecommendSheet title={title} onClose={() => setSheet(false)} />
      </Presence>
    </div>
  );
}

/**
 * Friends, each with a tick: pressing one sends the title to them at once and
 * ticks it, as Save's menu files at once. A friend already sent it is ticked
 * from the start. A `Dialog`, so it is portalled to the body: the menu it
 * opens from sits in the hero's top row, which the tab bar would otherwise cover.
 */
function RecommendSheet({ title, onClose }: { title: Title; onClose: () => void }) {
  const [targets, setTargets] = useState<RecommendTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    recommendTargetsFor(title.mediaType, title.tmdbId).then((t) => live && setTargets(t));
    return () => {
      live = false;
    };
  }, [title.mediaType, title.tmdbId]);

  const mark = (id: string, sent: boolean) => setTargets((ts) => ts?.map((t) => (t.id === id ? { ...t, sent } : t)) ?? ts);

  // Friends sent to from this sheet: only their tick pops in.
  const [sentNow, setSentNow] = useState<ReadonlySet<string>>(new Set());

  function send(id: string) {
    setError(null);
    setSentNow((s) => new Set(s).add(id));
    mark(id, true);
    startTransition(async () => {
      const outcome = await recommendTo(id, title.mediaType, title.tmdbId);
      if (!outcome.ok) {
        mark(id, false);
        setError(outcome.error);
      }
    });
  }

  return (
    <Dialog label="Recommend to a friend" onClose={onClose}>
      <DialogTitle>Recommend to a friend</DialogTitle>
      {targets === null ? (
        <p className="m-0 text-[13px] text-ink-2">Finding your friends…</p>
      ) : targets.length === 0 ? (
        <p className="m-0 text-[13px] leading-[1.45] text-ink-2">
          Nobody to send it to yet.{" "}
          <Link href="/friends" className="font-semibold text-ink underline">
            Find friends
          </Link>
        </p>
      ) : (
        <ul aria-label="Friends" className="m-0 flex list-none flex-col p-0">
          {targets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={t.sent}
                aria-label={t.sent ? `Sent to ${t.name}` : `Send to ${t.name}`}
                disabled={t.sent}
                onClick={() => send(t.id)}
                className="flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-1 py-2 text-left text-ink transition-colors duration-(--fast) ease-out hover:bg-surface"
              >
                <UserAvatar id={t.id} name={t.name} src={t.avatar} size={36} />
                <span className="min-w-0 grow truncate text-sm font-semibold">{t.name}</span>
                <span
                  aria-hidden="true"
                  className={`inline-flex size-[24px] shrink-0 items-center justify-center rounded-full ${t.sent ? "bg-accent text-black" : "border-[1.5px] border-ink-3"}`}
                >
                  {t.sent && <Icon name="check" size={14} className={sentNow.has(t.id) ? "motion-tick-in" : ""} />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="m-0 text-xs text-ink-2">{error}</p>}
      <button type="button" onClick={onClose} className={buttonClass("ghost", "md", "w-full")}>
        Done
      </button>
    </Dialog>
  );
}

/**
 * Request through Overseerr. When a service this person pays for already has
 * the title it asks first, since downloading something you can already watch
 * is the one request worth querying; otherwise it goes straight out.
 */
export function RequestButton({ title, alreadyOn, className }: { title: Title; alreadyOn: string[]; className: string }) {
  const [state, setState] = useState<"idle" | "sent" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Open is the question being asked; a press elsewhere is "never mind".
  const { setOpen: setAsking, ref, shown: askShown, state: askState } = usePopover();

  function send() {
    setAsking(false);
    startTransition(async () => {
      const outcome = await requestTitle(title.mediaType, title.tmdbId);
      if (outcome.ok) setState("sent");
      else {
        setState("failed");
        setError(outcome.error);
      }
    });
  }

  if (state === "sent") {
    return (
      <span className={className}>
        <Icon name="clock" size={18} />
        Requested
      </span>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (requestNeedsConfirming(alreadyOn)) setAsking(true);
          else send();
        }}
        className={className}
      >
        <Icon name="plus" size={18} />
        {pending ? "Requesting…" : "Request"}
      </button>
      {askShown && (
        <div role="alertdialog" aria-label="Request anyway?" data-state={askState} className={`${MENU} right-0 top-[calc(100%+8px)] w-72 origin-top-right gap-3 p-3.5`}>
          <p className="m-0 text-[13px] leading-[1.45] text-white/85">
            You can already watch this on <span className="font-semibold text-white">{alreadyOn.join(" and ")}</span>.
            Request it anyway?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={send} className={`${PRESS} inline-flex h-9 items-center rounded-full bg-white px-3.5 text-[13px] font-semibold text-black`}>
              Request anyway
            </button>
            <button type="button" onClick={() => setAsking(false)} className={`${PRESS} inline-flex h-9 items-center rounded-full bg-white/12 px-3.5 text-[13px] font-semibold text-white`}>
              Never mind
            </button>
          </div>
        </div>
      )}
      {state === "failed" && error && <p className="absolute right-0 top-[calc(100%+6px)] m-0 w-60 text-right text-xs text-ink-2">{error}</p>}
    </div>
  );
}
