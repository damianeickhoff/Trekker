"use client";

import { useState, useTransition } from "react";
import { todayKey } from "@/lib/dates";
import { removeViewing, saveViewing } from "@/lib/title-actions";
import { NOTE_MAX, PLACE_MAX, sourceWords, timesWatched } from "@/lib/viewing-words";
import type { Viewing } from "@/lib/viewings";
import { Icon } from "../icon";
import { Dialog, DialogTitle } from "../lists/dialog";
import { PRESS, ROW_WASH } from "../motion";
import { Presence } from "../presence";
import { buttonClass, Field, filterChipClass } from "../ui";

/*
 * Your viewings of a film or an episode: every time you watched it, newest first, with
 * where it was and a line about it. A row opens a sheet to change the day, say
 * where, write the line, or take that one viewing back. Laid out like Friends
 * who watched, which sits under it: the mono head, then rows that wash under
 * the pointer, no panel.
 */

const INPUT =
  "w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-ink-3";

export function Viewings({ items, places, className }: { items: Viewing[]; places: string[]; className: string }) {
  // The viewing stays set after the sheet closes, so it has something to draw while it leaves.
  const [editing, setEditing] = useState<Viewing | null>(null);
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <section aria-label="Your viewings" className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-baseline justify-between">
        <span className="mono-label">Your viewings</span>
        <span className="text-xs text-ink-3">{timesWatched(items.length)}</span>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {items.map((v) => {
          const where = v.place ?? sourceWords(v.source);
          return (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  setEditing(v);
                  setOpen(true);
                }}
                aria-label={`${v.label}${where ? `, ${where}` : ""}. Edit this viewing`}
                className={`${PRESS} flex w-full min-w-0 items-start gap-3 border-0 bg-transparent py-1.5 text-left text-ink ${ROW_WASH}`}
              >
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <Icon name={v.source === "plex" ? "play" : "check"} size={16} />
                </span>
                <span className="flex min-w-0 grow flex-col">
                  <span className="truncate text-[13px] font-semibold">{v.label}</span>
                  {where && <span className="truncate text-xs text-ink-3">{where}</span>}
                  {v.note && <span className="mt-0.5 whitespace-pre-line text-xs leading-[1.4] wrap-anywhere text-ink-2">{v.note}</span>}
                </span>
                <Icon name="pen" size={16} className="mt-2 shrink-0 text-ink-3" />
              </button>
            </li>
          );
        })}
      </ul>
      <Presence open={open}>
        {/* Keyed, so a second row's sheet starts from that row's answers. */}
        {editing && <ViewingSheet key={editing.id} viewing={editing} places={places} onClose={() => setOpen(false)} />}
      </Presence>
    </section>
  );
}

function ViewingSheet({ viewing, places, onClose }: { viewing: Viewing; places: string[]; onClose: () => void }) {
  const [day, setDay] = useState(viewing.day);
  const [place, setPlace] = useState(viewing.place ?? "");
  const [note, setNote] = useState(viewing.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The browser's today, which is the person's; the server refuses a later one too.
  const today = todayKey();

  function save() {
    setError(null);
    startTransition(async () => {
      if (await saveViewing(viewing.id, { day, place, note })) onClose();
      else setError("That could not be saved. Check the day is not in the future.");
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      if (await removeViewing(viewing.id)) onClose();
      else setError("That viewing could not be removed.");
    });
  }

  return (
    <Dialog label="This viewing" onClose={onClose}>
      <DialogTitle>{viewing.label}</DialogTitle>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Day" type="date" value={day} max={today} required onChange={(e) => setDay(e.target.value)} />
        <div className="flex flex-col gap-2">
          <Field
            label="Where"
            value={place}
            maxLength={PLACE_MAX}
            placeholder="Plex, Netflix, the cinema"
            onChange={(e) => setPlace(e.target.value)}
          />
          {places.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Places you use">
              {places.map((p) => {
                const on = place.trim().toLowerCase() === p.toLowerCase();
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPlace(on ? "" : p)}
                    className={filterChipClass(on)}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <label className="flex w-full flex-col gap-1.5">
          <span className="mono-label">A note</span>
          <textarea
            value={note}
            maxLength={NOTE_MAX}
            rows={3}
            placeholder="Who it was with, what happened"
            onChange={(e) => setNote(e.target.value)}
            className={`${INPUT} resize-none py-3 leading-[1.4]`}
          />
        </label>
        {sourceWords(viewing.source) && (
          <p className="m-0 text-xs text-ink-3">{sourceWords(viewing.source)}. Removing it here keeps it from coming back on the next sync.</p>
        )}
        {error && <p className="m-0 text-[13px] font-semibold text-ink">{error}</p>}
        {confirming ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[13px] text-ink-2">Take this viewing back? The others stay.</p>
            <div className="flex gap-2">
              <button type="button" disabled={pending} onClick={remove} className={buttonClass("primary", "md", "grow")}>
                Remove it
              </button>
              <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={buttonClass("ghost", "md", "grow")}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="submit" disabled={pending || !day} className={buttonClass("primary", "md", "grow")}>
              Save
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={buttonClass("ghost", "md")}>
              <Icon name="x" size={18} />
              Remove
            </button>
          </div>
        )}
      </form>
    </Dialog>
  );
}
