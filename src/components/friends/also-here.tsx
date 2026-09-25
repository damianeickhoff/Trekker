"use client";

import { useState } from "react";
import type { Person } from "@/lib/friends";
import { Icon } from "../icon";
import { buttonClass, iconButtonClass } from "../ui";
import { UserAvatar } from "../user-avatar";
import { AddButton } from "./buttons";

/*
 * Everyone else on this instance, to add, and the box that finds one of them
 * by name. The list is the whole instance, a household or two, so finding is
 * a filter in the browser rather than a search on the server.
 */

export const FIND_ID = "find-people";

/** Takes the finger or the pointer straight to the box, from the page's header. */
export function FindPeopleButton({ compact = false }: { compact?: boolean }) {
  const go = () => {
    const box = document.getElementById(FIND_ID) as HTMLInputElement | null;
    box?.scrollIntoView({ block: "center" });
    box?.focus();
  };
  return compact ? (
    <button type="button" aria-label="Find people" onClick={go} className={iconButtonClass("ghost", "sm")}>
      <Icon name="search" size={20} />
    </button>
  ) : (
    <button type="button" onClick={go} className={buttonClass("ghost", "sm")}>
      <Icon name="search" size={18} />
      Find people
    </button>
  );
}

export function AlsoHere({ people }: { people: Person[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  return (
    <>
      <label className="my-1 flex h-10 items-center gap-2.5 rounded-xl bg-surface px-3 text-ink-3 shadow-elevation focus-within:shadow-[0_0_0_2px_var(--accent)]">
        <Icon name="search" size={16} />
        <input
          id={FIND_ID}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find people by name"
          aria-label="Find people by name"
          className="min-w-0 grow border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      {shown.length === 0 ? (
        <p className="m-0 py-2 text-[13px] text-ink-2">{q ? `Nobody here called “${query.trim()}”.` : "Everyone here is already a friend."}</p>
      ) : (
        shown.map((p) => (
          <div key={p.id} className="flex items-center gap-3 py-2">
            <UserAvatar id={p.id} name={p.name} src={p.avatar} size={44} />
            <span className="flex min-w-0 grow flex-col gap-0.5">
              <span className="text-sm font-semibold">{p.name}</span>
              <span className="truncate text-xs text-ink-3">On this Trekker</span>
            </span>
            <AddButton userId={p.id} />
          </div>
        ))
      )}
    </>
  );
}
