"use client";

import { useOptimistic, useState, useTransition } from "react";
import { FEELINGS } from "@/lib/feelings";
import type { CommentItem } from "@/lib/social";
import { chooseFeeling, postComment, removeComment } from "@/lib/title-actions";
import { Icon } from "../icon";
import { Link } from "../link";
import { ExitList } from "../exit-list";
import { PRESS } from "../motion";
import { initialsOf } from "./people";

/*
 * How it felt, and comments. Both are visible to everyone signed in. On a
 * desktop title page they sit on the hero, so labels and text there take the
 * hero's white from `xl` and the theme's ink below it, where the column has
 * dropped under the artwork.
 */

const CHIP = `${PRESS} inline-flex h-[34px] items-center gap-2 rounded-full border-0 px-3 text-[13px] font-semibold`;
const ON = "bg-primary text-on-primary";
const OFF = "bg-surface text-ink shadow-elevation";

type Where = { mediaType: "movie" | "tv"; tmdbId: number; season: number; episode: number };

/**
 * The feelings for a film or one episode: every choice, with how many people
 * picked it, and yours filled. Choosing yours again takes it back.
 */
export function FeelingsPicker({ where, counts, mine }: { where: Where; counts: Record<string, number>; mine: string | null }) {
  const [chosen, setChosen] = useOptimistic(mine);
  const [, startTransition] = useTransition();

  function choose(id: string) {
    const next = chosen === id ? null : id;
    startTransition(async () => {
      setChosen(next);
      await chooseFeeling(where.mediaType, where.tmdbId, where.season, where.episode, next);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {FEELINGS.map((f) => {
        const on = chosen === f.id;
        // The tally as it will be once this choice lands, so the count moves with the tap.
        const n = (counts[f.id] ?? 0) - (mine === f.id ? 1 : 0) + (on ? 1 : 0);
        return (
          <button key={f.id} type="button" aria-pressed={on} onClick={() => choose(f.id)} className={`${CHIP} ${on ? ON : OFF}`}>
            {f.label}
            {n > 0 && <span className="font-mono text-[11px] opacity-70">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A show's feelings, gathered from its episodes: read here, answered on each episode. */
export function FeelingsTally({ counts }: { counts: Record<string, number> }) {
  const rows = FEELINGS.filter((f) => counts[f.id]).sort((a, b) => counts[b.id] - counts[a.id]);
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((f, i) => (
        <span key={f.id} className={`${CHIP} ${i === 0 ? ON : OFF}`}>
          {f.label}
          <span className="font-mono text-[11px] opacity-70">{counts[f.id]}</span>
        </span>
      ))}
    </div>
  );
}

function Comment({ c }: { c: CommentItem }) {
  const [, startTransition] = useTransition();
  const dim = "text-ink-3";
  return (
    <div className="flex items-start gap-2.5">
      <span className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-[11px] font-bold text-ink shadow-[0_0_0_2px_var(--accent)]">
        {initialsOf(c.author)}
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5 text-[13px]">
        <span>
          <strong className="font-semibold">{c.author.split(" ")[0]}</strong> <span className={dim}>· {c.when}</span>
        </span>
        <span className={`whitespace-pre-line leading-[1.4] wrap-anywhere text-ink-2`}>{c.body}</span>
        {c.replies.length > 0 && (
          <ul className="m-0 mt-2 flex list-none flex-col gap-2.5 p-0">
            {c.replies.map((r) => (
              <Comment key={r.id} c={r} />
            ))}
          </ul>
        )}
      </span>
      {c.own && (
        <button
          type="button"
          aria-label="Delete your comment"
          onClick={() => startTransition(async () => void (await removeComment(c.id)))}
          className={`${PRESS} inline-flex size-7 shrink-0 items-center justify-center rounded-full border-0 bg-transparent ${dim}`}
        >
          <Icon name="x" size={14} />
        </button>
      )}
    </div>
  );
}

/**
 * The newest few comments, "All N" for the rest in place, and a box to add
 * one. `href` is the full comments page, a chevron at the head's end like
 * every other section's; the page itself passes none, and shows them all.
 */
export function Comments({
  where,
  items,
  shown = 2,
  href,
}: {
  where: Pick<Where, "mediaType" | "tmdbId">;
  items: CommentItem[];
  shown?: number;
  href?: string;
}) {
  const [all, setAll] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = all ? items : items.slice(-shown);
  const dim = "text-ink-3";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <span className={`font-mono text-[11px] font-medium uppercase tracking-[0.05em] ${dim}`}>Comments · everyone</span>
        <span className="grow" />
        {items.length > shown && (
          <button type="button" onClick={() => setAll((a) => !a)} className={`${PRESS} border-0 bg-transparent p-0 text-xs font-semibold text-ink-2 hover:text-ink`}>
            {all ? "Fewer" : `All ${items.length}`}
          </button>
        )}
        {href && (
          <Link
            href={href}
            aria-label="See all comments"
            className="inline-flex self-center text-ink-3 transition-[translate,color] duration-(--fast) ease-out hover:translate-x-0.5 hover:text-ink"
          >
            <Icon name="chevR" size={18} />
          </Link>
        )}
      </div>
      {visible.length > 0 ? (
        // A comment just posted rises in; one deleted collapses (`ExitList`).
        <ExitList label="Comments" className="flex flex-col" gap="pb-3">
          {visible.map((c) => (
            <Comment key={c.id} c={c} />
          ))}
        </ExitList>
      ) : (
        <p className={`m-0 text-[13px] ${dim}`}>Nobody has said anything yet.</p>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (!body) return;
          startTransition(async () => {
            if (await postComment(where.mediaType, where.tmdbId, body)) setText("");
          });
        }}
      >
        <label className="flex min-w-0 grow">
          <span className="sr-only">Add a comment</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            placeholder="Say something about it"
            className="h-10 min-w-0 grow rounded-full border border-line bg-surface px-4 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-ink-3"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className={`${PRESS} inline-flex h-10 shrink-0 items-center rounded-full border-0 bg-primary px-4 text-[13px] font-semibold text-on-primary disabled:opacity-50`}
        >
          Post
        </button>
      </form>
    </div>
  );
}
