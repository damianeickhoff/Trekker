"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addTitleToList,
  deleteListAction,
  renameListAction,
  requestAllOnList,
  searchForList,
  type SearchHit,
} from "@/lib/list-actions";
import type { RequestPlan } from "@/lib/lists";
import { titleHref } from "@/lib/marks";
import { Icon } from "../icon";
import { Link } from "../link";
import { Poster } from "../poster";
import { PRESS } from "../motion";
import { Presence } from "../presence";
import { MENU, MENU_ITEM, menuOrigin, usePopover } from "../title/popover";
import { buttonClass, Field, iconButtonClass } from "../ui";
import { Dialog, DialogTitle } from "./dialog";

/*
 * A list's own buttons: Pick one for me, Edit, Add titles, Request all and the
 * More menu, placed where the mockups put them at each width. Each placement
 * is its own instance with its own dialogs; only one is on screen at a time.
 */

type ListRef = { id: string; name: string; kind: "manual" | "smart" };
type TitleRef = { mediaType: "movie" | "tv"; tmdbId: number };

type Props = {
  list: ListRef;
  /** Titles never started, for Pick one for me; all titles when every one has been seen. */
  pool: TitleRef[];
  /** Smart lists on an instance with Overseerr: what Request all would ask for. */
  plan: RequestPlan | null;
};

type Open = null | "rename" | "delete" | "add" | "request";

function useDialogs() {
  const [open, setOpen] = useState<Open>(null);
  return { open, show: (o: Open) => setOpen(o), close: () => setOpen(null) };
}

function PickOne({ pool, className }: { pool: TitleRef[]; className: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pool.length === 0}
      className={className}
      onClick={() => {
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick) router.push(titleHref(pick.mediaType, pick.tmdbId));
      }}
    >
      <Icon name="sparkle" size={18} />
      Pick one for me
    </button>
  );
}

const GLASS_ICON = `${PRESS} inline-flex shrink-0 items-center justify-center rounded-full border-0 bg-white/16 text-white backdrop-blur-[10px]`;

/** Phones, top right of the banner: add (manual lists) and More. */
export function MobileHeaderControls(props: Props) {
  const d = useDialogs();
  return (
    <div className="flex gap-2">
      {props.list.kind === "manual" && (
        <button type="button" aria-label="Add a title" onClick={() => d.show("add")} className={`${GLASS_ICON} size-10`}>
          <Icon name="plus" size={20} />
        </button>
      )}
      <MoreMenu {...props} onPick={d.show} className={`${GLASS_ICON} size-10`} />
      <Dialogs {...props} open={d.open} onClose={d.close} />
    </div>
  );
}

/** Phones, at the foot of the banner: Pick one for me and Edit. */
export function MobileHeroControls(props: Props) {
  const d = useDialogs();
  return (
    <div className="flex gap-2">
      <PickOne pool={props.pool} className={buttonClass("white", "sm")} />
      {props.list.kind === "smart" ? (
        <Link href={`/lists/${props.list.id}/edit`} className={buttonClass("glass", "sm")}>
          Edit
        </Link>
      ) : (
        <button type="button" onClick={() => d.show("rename")} className={buttonClass("glass", "sm")}>
          Edit
        </button>
      )}
      <Dialogs {...props} open={d.open} onClose={d.close} />
    </div>
  );
}

/** Desktop, beside the name: Pick one for me, Add titles or Request all, More. */
export function DesktopControls(props: Props) {
  const d = useDialogs();
  return (
    <div className="flex shrink-0 gap-2 pb-1.5">
      <PickOne pool={props.pool} className={buttonClass("white", "md")} />
      {props.list.kind === "manual" ? (
        <button type="button" onClick={() => d.show("add")} className={buttonClass("glass", "md")}>
          <Icon name="plus" size={18} />
          Add titles
        </button>
      ) : props.plan ? (
        <button type="button" onClick={() => d.show("request")} className={buttonClass("glass", "md")}>
          <Icon name="clock" size={18} />
          Request all
        </button>
      ) : (
        <Link href={`/lists/${props.list.id}/edit`} className={buttonClass("glass", "md")}>
          <Icon name="sliders" size={18} />
          Edit
        </Link>
      )}
      <MoreMenu {...props} onPick={d.show} className={`${GLASS_ICON} size-11`} menuClass="right-0" />
      <Dialogs {...props} open={d.open} onClose={d.close} />
    </div>
  );
}

function MoreMenu({
  list,
  plan,
  onPick,
  className,
  menuClass = "right-0",
}: Props & { onPick: (o: Open) => void; className: string; menuClass?: string }) {
  const { open, setOpen, ref, shown, state } = usePopover();
  const pick = (o: Open) => {
    setOpen(false);
    onPick(o);
  };
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={className}>
        <Icon name="dots" size={20} />
      </button>
      {shown && (
        <div role="menu" data-state={state} className={`${MENU} top-[calc(100%+8px)] w-56 ${menuClass} ${menuOrigin(menuClass)}`}>
          {list.kind === "smart" ? (
            <Link role="menuitem" href={`/lists/${list.id}/edit`} className={MENU_ITEM}>
              <Icon name="sliders" size={18} />
              Edit filters
            </Link>
          ) : (
            <button type="button" role="menuitem" onClick={() => pick("rename")} className={MENU_ITEM}>
              <Icon name="pen" size={18} />
              Rename
            </button>
          )}
          {list.kind === "manual" && (
            <button type="button" role="menuitem" onClick={() => pick("add")} className={MENU_ITEM}>
              <Icon name="plus" size={18} />
              Add titles
            </button>
          )}
          {plan && (
            <button type="button" role="menuitem" onClick={() => pick("request")} className={MENU_ITEM}>
              <Icon name="clock" size={18} />
              Request all
            </button>
          )}
          <button type="button" role="menuitem" onClick={() => pick("delete")} className={MENU_ITEM}>
            <Icon name="x" size={18} />
            Delete list
          </button>
        </div>
      )}
    </div>
  );
}

/** The one open, kept by `Presence` while it leaves. */
function Dialogs({ list, plan, open, onClose }: Props & { open: Open; onClose: () => void }) {
  const dialog =
    open === "rename" ? (
      <RenameDialog list={list} onClose={onClose} />
    ) : open === "delete" ? (
      <DeleteDialog list={list} onClose={onClose} />
    ) : open === "add" ? (
      <AddTitlesDialog list={list} onClose={onClose} />
    ) : open === "request" && plan ? (
      <RequestAllDialog list={list} plan={plan} onClose={onClose} />
    ) : null;
  return <Presence open={dialog !== null}>{dialog}</Presence>;
}

/** Edit on a manual list: its name, and the way to delete it. */
function RenameDialog({ list, onClose }: { list: ListRef; onClose: () => void }) {
  const [name, setName] = useState(list.name);
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  if (deleting) return <DeleteDialog list={list} onClose={onClose} />;
  return (
    <Dialog label="Edit list" onClose={onClose}>
      <DialogTitle>Edit list</DialogTitle>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            if (await renameListAction(list.id, name)) onClose();
          });
        }}
      >
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !name.trim()} className={buttonClass("primary", "md")}>
            <Icon name="check" size={18} />
            Save
          </button>
          <button type="button" onClick={onClose} className={buttonClass("ghost", "md")}>
            Never mind
          </button>
          <span className="grow" />
          <button type="button" onClick={() => setDeleting(true)} className={buttonClass("ghost", "md", "text-ink-2")}>
            Delete list
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ list, onClose }: { list: ListRef; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog label="Delete list" onClose={onClose}>
      <DialogTitle>Delete “{list.name}”?</DialogTitle>
      <p className="m-0 text-[13px] leading-[1.45] text-ink-2">
        {list.kind === "smart"
          ? "The question goes, and with it the titles it found. Nothing you have watched or saved elsewhere changes."
          : "The list goes. The titles on it stay wherever else you have put them, and your history is untouched."}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              if (await deleteListAction(list.id)) router.replace("/lists");
            })
          }
          className={buttonClass("primary", "md")}
        >
          {pending ? "Deleting…" : "Delete list"}
        </button>
        <button type="button" onClick={onClose} className={buttonClass("ghost", "md")}>
          Keep it
        </button>
      </div>
    </Dialog>
  );
}

/**
 * Add titles: a search of TMDB, a moment after typing stops, with an add
 * button on each result. What is already on the list says so.
 */
function AddTitlesDialog({ list, onClose }: { list: ListRef; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [searching, startSearch] = useTransition();
  const [, startAdd] = useTransition();
  const asked = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const ticket = ++asked.current;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const found = await searchForList(list.id, term);
        // An answer to an older question is not an answer to this one.
        if (ticket === asked.current) setHits(found);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, list.id]);

  const shown = query.trim().length < 2 ? [] : hits;

  return (
    <Dialog label="Add titles" onClose={onClose} wide>
      <div className="flex items-center justify-between gap-3">
        <DialogTitle>Add to {list.name}</DialogTitle>
        <button type="button" aria-label="Done" onClick={onClose} className={iconButtonClass("ghost", "sm")}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <label className="flex h-12 items-center gap-3 rounded-[14px] bg-surface px-4 text-ink-3 shadow-elevation focus-within:shadow-[0_0_0_2px_var(--accent)]">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search films and shows"
          aria-label="Search films and shows"
          className="min-w-0 grow border-0 bg-transparent text-base text-ink outline-none"
        />
      </label>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0" aria-busy={searching}>
        {shown.map((hit) => {
          const key = `${hit.mediaType}-${hit.tmdbId}`;
          const on = hit.onList || added.has(key);
          return (
            <li key={key} className="flex items-center gap-3">
              <Poster path={hit.poster} alt="" title={hit.title} width={44} height={66} sizes="44px" className="h-[66px] w-11 rounded-md" />
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{hit.title}</span>
                <span className="text-xs text-ink-2">
                  {hit.mediaType === "tv" ? "Series" : "Film"}
                  {hit.year ? ` · ${hit.year}` : ""}
                </span>
              </span>
              <button
                type="button"
                disabled={on}
                aria-label={on ? `${hit.title} is on the list` : `Add ${hit.title}`}
                onClick={() => {
                  setAdded((s) => new Set(s).add(key));
                  startAdd(async () => {
                    if (!(await addTitleToList(list.id, hit.mediaType, hit.tmdbId))) {
                      setAdded((s) => {
                        const next = new Set(s);
                        next.delete(key);
                        return next;
                      });
                    }
                  });
                }}
                className={on ? iconButtonClass("amber", "sm") : iconButtonClass("ghost", "sm")}
              >
                <Icon name={on ? "check" : "plus"} size={18} />
              </button>
            </li>
          );
        })}
      </ul>
      {query.trim().length >= 2 && !searching && shown.length === 0 && (
        <p className="m-0 text-[13px] text-ink-2">Nothing for “{query.trim()}”. Check the spelling, or try the original title.</p>
      )}
    </Dialog>
  );
}

/**
 * Request all: asks first, always, because it spends somebody else's disk on
 * up to twenty titles at once, and says which of them are already on a
 * service this person pays for, with the choice to leave those out.
 */
function RequestAllDialog({ list, plan, onClose }: { list: ListRef; plan: RequestPlan; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const total = plan.titles.length;
  const paid = plan.subscribed.length;
  const services = [...new Set(plan.subscribed.flatMap((s) => s.on))];

  function send(skip: boolean) {
    startTransition(async () => {
      const outcome = await requestAllOnList(list.id, skip);
      const filed = outcome.filed ? `Requested ${outcome.filed} ${outcome.filed === 1 ? "title" : "titles"}.` : "Nothing was requested.";
      setResult(outcome.error ? `${filed} ${outcome.error}` : filed);
    });
  }

  return (
    <Dialog label="Request all" onClose={onClose}>
      <DialogTitle>Request what this list finds?</DialogTitle>
      {result ? (
        <>
          <p className="m-0 text-[13px] leading-[1.45] text-ink-2">{result}</p>
          <button type="button" onClick={onClose} className={buttonClass("primary", "md", "self-start")}>
            Done
          </button>
        </>
      ) : total === 0 ? (
        <>
          <p className="m-0 text-[13px] leading-[1.45] text-ink-2">
            Everything unseen on this list is already on Plex or already requested.
          </p>
          <button type="button" onClick={onClose} className={buttonClass("primary", "md", "self-start")}>
            Done
          </button>
        </>
      ) : (
        <>
          <p className="m-0 text-[13px] leading-[1.45] text-ink-2">
            Overseerr will be asked for {total} {total === 1 ? "title" : "titles"}: the unseen ones on this list that are not on
            Plex and not already requested{total === 20 ? ", the first twenty of them" : ""}.
          </p>
          {paid > 0 && (
            <p className="m-0 text-[13px] leading-[1.45] text-ink-2">
              You can already watch {paid === 1 ? "one of them" : `${paid} of them`} on{" "}
              <span className="font-semibold text-ink">{services.join(" and ")}</span>:{" "}
              {plan.subscribed
                .slice(0, 4)
                .map((s) => s.title)
                .join(", ")}
              {paid > 4 ? " and more" : ""}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => send(false)} className={buttonClass("primary", "md")}>
              {pending ? "Requesting…" : paid > 0 ? `Request all ${total}` : `Request ${total}`}
            </button>
            {paid > 0 && total - paid > 0 && (
              <button type="button" disabled={pending} onClick={() => send(true)} className={buttonClass("ghost", "md")}>
                Skip those, request {total - paid}
              </button>
            )}
            <button type="button" disabled={pending} onClick={onClose} className={buttonClass("ghost", "md")}>
              Never mind
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
