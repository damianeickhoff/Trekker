"use client";

import { EmptyState } from "../empty-state";
import type { Note } from "@/lib/notifications";
import { whenLabel } from "@/lib/when";
import { Icon } from "../icon";
import { Link } from "../link";
import { ROW_WASH } from "../motion";
import { Bone } from "../skeleton";
import { buttonClass } from "../ui";
import { useBell } from "./bell-provider";

/*
 * One notification: an icon in a circle (amber while unread), what happened,
 * the line under it, and when. Opening it marks it read.
 */

export function NoteRow({ note, onOpen }: { note: Note; onOpen?: () => void }) {
  const { markOne } = useBell();
  return (
    <Link
      href={note.href}
      onClick={() => {
        markOne(note.key);
        onOpen?.();
      }}
      className={`flex items-start gap-3 border-b border-line py-2.5 hover:text-ink ${ROW_WASH}`}
    >
      <span
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${
          note.read ? "bg-surface-2 text-ink-3" : "bg-accent text-black"
        }`}
      >
        <Icon name={note.icon} size={17} />
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className={`text-sm ${note.read ? "font-semibold" : "font-bold"}`}>{note.title}</span>
        <span className="text-xs text-ink-2">{note.body}</span>
      </span>
      <span className="mono-label shrink-0 text-[10px]">
        {whenLabel(note.at, new Date(), { today: note.kind === "airing" || note.kind === "challenges-up" ? "word" : "time" })}
      </span>
    </Link>
  );
}

export function NoteBones({ rows = 4 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-line py-2.5">
          <Bone className="size-9 rounded-full" />
          <div className="flex grow flex-col gap-1.5">
            <Bone className="h-3.5 w-3/5 rounded" />
            <Bone className="h-3 w-4/5 rounded" />
          </div>
          <Bone className="h-2.5 w-10 rounded" />
        </div>
      ))}
    </>
  );
}

/**
 * Nothing at all yet: what will land here, and on the phone's page the way to
 * have it pushed. The desktop popover has that link at its foot already.
 */
export function NoNotes({ withSettings = false }: { withSettings?: boolean }) {
  return (
    <EmptyState
      icon="bell"
      title="Nothing yet"
      className="my-2"
      action={
        withSettings ? (
          <Link href="/settings/notifications" className={buttonClass("ghost", "sm")}>
            Notification settings
          </Link>
        ) : undefined
      }
    >
      Friend requests, recommendations, badges and what airs today land here.
    </EmptyState>
  );
}
