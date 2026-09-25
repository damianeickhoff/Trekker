"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createList } from "@/lib/list-actions";
import { Icon } from "../icon";
import { Link } from "../link";
import { Presence } from "../presence";
import { MENU, MENU_ITEM, usePopover } from "../title/popover";
import { buttonClass, Field, iconButtonClass } from "../ui";
import { Dialog, DialogTitle } from "./dialog";

/*
 * Making a list. This is the only place one is made: Save on a title page only
 * files, so that a list is a separate act with a name to think of, made where
 * you can see what you already have.
 */

function NewListDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createList(name);
      if ("error" in result) setError(result.error);
      else router.push(`/lists/${result.id}`);
    });
  }

  return (
    <Dialog label="New list" onClose={onClose}>
      <DialogTitle>New list</DialogTitle>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Rainy Sunday" />
        {error && <p className="m-0 text-[13px] text-ink-2">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending || !name.trim()} className={buttonClass("primary", "md")}>
            <Icon name="plus" size={18} />
            {pending ? "Making it…" : "Make list"}
          </button>
          <button type="button" onClick={onClose} className={buttonClass("ghost", "md")}>
            Never mind
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * The ways into a new list: the desktop header's primary button, the empty
 * row's ghost button, and the dashed tile at the end of My lists on phones.
 */
export function NewListButton({ variant }: { variant: "primary" | "ghost" | "tile" }) {
  const [open, setOpen] = useState(false);
  const className =
    variant === "tile"
      ? "flex h-[129px] w-[110px] shrink-0 flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-ink-3 bg-transparent text-[13px] font-semibold text-ink-2 opacity-80"
      : buttonClass(variant, variant === "primary" ? "sm" : "md");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Icon name="plus" size={variant === "tile" ? 22 : 18} />
        New list
      </button>
      <Presence open={open}>
        <NewListDialog onClose={() => setOpen(false)} />
      </Presence>
    </>
  );
}

/** Phones: the plus beside search, offering either kind. */
export function NewMenu() {
  const { open, setOpen, ref, shown, state } = usePopover();
  const [naming, setNaming] = useState(false);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="New list"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={iconButtonClass("ghost", "sm")}
      >
        <Icon name="plus" size={20} />
      </button>
      {shown && (
        <div role="menu" data-state={state} className={`${MENU} right-0 top-[calc(100%+8px)] w-56 origin-top-right`}>
          <button
            type="button"
            role="menuitem"
            className={MENU_ITEM}
            onClick={() => {
              setOpen(false);
              setNaming(true);
            }}
          >
            <Icon name="list" size={18} />
            New list
          </button>
          <Link role="menuitem" href="/lists/new" className={MENU_ITEM}>
            <Icon name="sparkle" size={18} />
            New smart list
          </Link>
        </div>
      )}
      <Presence open={naming}>
        <NewListDialog onClose={() => setNaming(false)} />
      </Presence>
    </div>
  );
}
