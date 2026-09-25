import type { ReactNode } from "react";
import type { ActivityRow } from "@/lib/friends";
import { titleHref } from "@/lib/marks";
import { agoLabel } from "@/lib/when";
import { Icon } from "../icon";
import { Link } from "../link";
import { ROW_WASH } from "../motion";
import { Poster } from "../poster";
import { Bone } from "../skeleton";
import { UserAvatar } from "../user-avatar";

/*
 * The friends page's rows: a person with a line under them and whatever they
 * need at the right, and the week's activity.
 */

export function PersonRow({
  id,
  name,
  avatar,
  line,
  right,
  href,
}: {
  id: string;
  name: string;
  avatar: string | null;
  line: string;
  right?: ReactNode;
  /** A friend's row opens their profile; nobody else's has one to open. */
  href?: string;
}) {
  const body = (
    <>
      <UserAvatar id={id} name={name} src={avatar} size={44} />
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-semibold">{name}</span>
        <span className="truncate text-xs text-ink-3">{line}</span>
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-3 py-2">
      {href ? (
        <Link href={href} className={`group/row flex min-w-0 grow items-center gap-3 ${ROW_WASH}`}>
          {body}
          <span className="text-ink-3 transition-[translate] duration-(--fast) ease-out group-hover/row:translate-x-0.5">
            <Icon name="chevR" size={18} />
          </span>
        </Link>
      ) : (
        <span className="flex min-w-0 grow items-center gap-3">{body}</span>
      )}
      {right}
    </div>
  );
}

export function PersonRowBones({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Bone className="size-11 rounded-full" />
          <div className="flex grow flex-col gap-1.5">
            <Bone className="h-3.5 w-24 rounded" />
            <Bone className="h-3 w-40 rounded" />
          </div>
          <Bone className="h-9 w-20 rounded-full" />
        </div>
      ))}
    </>
  );
}

/** "Anna watched S01 · E05", the title under it, and when. */
export function Activity({ rows, className = "flex flex-col gap-3" }: { rows: ActivityRow[]; className?: string }) {
  if (rows.length === 0) return <p className="m-0 text-[13px] text-ink-2">Nothing from your friends this week.</p>;
  return (
    <div className={className}>
      {rows.map((r) => (
        <Link key={r.key} href={titleHref(r.mediaType, r.tmdbId)} className={`flex items-center gap-3 ${ROW_WASH}`}>
          <Poster path={r.poster} alt="" title={r.title} width={40} height={60} sizes="40px" className="h-[60px] w-10 rounded-md" />
          <span className="flex min-w-0 grow flex-col gap-0.5">
            <span className="text-[13px]">
              <strong>{r.who}</strong> {r.what}
            </span>
            <span className="truncate text-[13px] font-semibold">{r.title}</span>
          </span>
          <span className="mono-label shrink-0 text-[10px]">{agoLabel(r.at)}</span>
        </Link>
      ))}
    </div>
  );
}

export function ActivityBones() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Bone className="h-[60px] w-10 rounded-md" />
          <div className="flex grow flex-col gap-1.5">
            <Bone className="h-3 w-1/2 rounded" />
            <Bone className="h-3.5 w-3/4 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
