"use client";

import { useState } from "react";
import type { TraktThread, TraktComment as Comment } from "@/lib/trakt-comments";
import { Icon } from "../icon";
import { PRESS } from "../motion";
import { initialsOf } from "./people";

/*
 * What people on Trakt said about a film or an episode, under the instance's own
 * comments and laid out like them, with three differences that say these are
 * strangers: no amber ring on the initials (the ring is for people on this
 * instance), likes and replies instead of a delete, and every link leaving
 * for Trakt, where the conversation actually lives and can be answered.
 *
 * A spoiler is veiled until it is asked for, unless you have seen the film or episode,
 * when there is nothing left to spoil.
 */

/** Past this a comment is clamped to five lines with More, so one review cannot bury the rest. */
const LONG = 320;

const TEXT_LINK = `${PRESS} border-0 bg-transparent p-0 text-xs font-semibold text-ink-2 hover:text-ink`;

function TraktComment({ c, watched }: { c: Comment; watched: boolean }) {
  const [revealed, setRevealed] = useState(watched || !c.spoiler);
  const [open, setOpen] = useState(false);
  const long = c.body.length > LONG || c.body.split("\n").length > 5;

  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden="true" className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-[11px] font-bold text-ink">
        {initialsOf(c.author)}
      </span>
      <span className="flex min-w-0 grow flex-col gap-1 text-[13px]">
        <span className="truncate">
          {c.authorUrl ? (
            <a href={c.authorUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink hover:underline">
              {c.author}
            </a>
          ) : (
            <strong className="font-semibold">{c.author}</strong>
          )}{" "}
          <span className="text-ink-3">· {c.when}</span>
        </span>
        {revealed ? (
          <>
            <span className={`whitespace-pre-line leading-[1.4] wrap-anywhere text-ink-2 ${long && !open ? "line-clamp-5" : ""}`}>{c.body}</span>
            {long && (
              <button type="button" onClick={() => setOpen((o) => !o)} className={`${TEXT_LINK} self-start`}>
                {open ? "Less" : "More"}
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className={`${PRESS} self-start rounded-xl border-0 bg-surface-2 px-3 py-2 text-left text-[13px] text-ink-2 hover:text-ink`}
          >
            Spoiler. Show it
          </button>
        )}
        {(c.likes > 0 || c.replies > 0 || c.rating !== null) && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
            {c.rating !== null && <span className="font-mono">{c.rating}/10</span>}
            {c.likes > 0 && (
              <span className="inline-flex items-center gap-1" aria-label={`${c.likes} ${c.likes === 1 ? "like" : "likes"}`}>
                <Icon name="heart" size={12} />
                <span className="font-mono">{c.likes}</span>
              </span>
            )}
            {c.replies > 0 && (
              <a href={c.url} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink">
                {c.replies} {c.replies === 1 ? "reply" : "replies"}
              </a>
            )}
          </span>
        )}
      </span>
    </li>
  );
}

export function TraktComments({
  thread,
  watched,
  noun,
  shown = 3,
}: {
  thread: TraktThread;
  watched: boolean;
  /** "this film" or "this episode", for the line when nobody has said anything. */
  noun: string;
  shown?: number;
}) {
  const [more, setMore] = useState(false);
  const visible = more ? thread.comments : thread.comments.slice(0, shown);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <span className="mono-label">Comments · Trakt</span>
        <span className="grow" />
        {thread.comments.length > shown && (
          <button type="button" onClick={() => setMore((m) => !m)} className={TEXT_LINK}>
            {more ? "Fewer" : "More"}
          </button>
        )}
      </div>
      {visible.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {visible.map((c) => (
            <TraktComment key={c.id} c={c} watched={watched} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-ink-3">Nobody on Trakt has said anything about {noun} yet.</p>
      )}
      <a href={thread.url} target="_blank" rel="noreferrer" className="self-start text-xs font-semibold text-ink-2 hover:text-ink">
        {thread.total > thread.comments.length ? `All ${thread.total} on Trakt` : "Open on Trakt"}
      </a>
    </div>
  );
}
