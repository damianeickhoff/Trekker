"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { REACTIONS } from "@/lib/feelings";
import { deleteComment, postComment, toggleReaction } from "@/lib/comment-actions";
import type { CommentNode } from "@/lib/comments";

/**
 * The conversation about a title, open to everyone on the instance.
 *
 * Deliberately not the review section, which sits above it and stays between
 * friends. A review is a paragraph about your own score; this is people talking
 * to each other, and a conversation only your friends can join is a diary with
 * extra steps.
 *
 * One level of replies. The server enforces it — see `postComment` — because
 * indentation is a rendering decision and the shape of the data should not
 * depend on one.
 */

function ago(date: Date) {
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-flare-600 to-ember-500 text-sm font-black text-white">
      {src ? (
        <Image src={src} alt="" width={36} height={36} className="h-9 w-9 object-cover" unoptimized />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

const BOX =
  "w-full resize-y rounded-xl border border-ink-700/70 bg-ink-900/60 p-3 text-sm leading-relaxed text-ink-100 outline-none transition placeholder:text-ink-400 focus:border-flare-500 disabled:opacity-60 light:bg-white/70";

const SEND =
  "rounded-lg bg-flare-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-flare-500 disabled:opacity-40";

type ItemProps = {
  comment: CommentNode;
  /** A reply renders flatter, and is offered no Reply of its own. */
  reply?: boolean;
  signedIn: boolean;
  pending: boolean;
  onReact: (commentId: string, emoji: string) => void;
  onDelete: (id: string) => void;
  replyTo: string | null;
  onToggleReply: (id: string) => void;
  replyDraft: string;
  onReplyDraft: (value: string) => void;
  onSendReply: (parentId: string) => void;
};

/**
 * Declared out here rather than inside `TitleComments`, which is not a style
 * preference: a component declared during a render is a new type on every
 * render, so React unmounts and remounts the subtree — and the reply box loses
 * focus after every character typed into it.
 */
function CommentItem(props: ItemProps) {
  const { comment, reply = false, signedIn, pending } = props;

  return (
    <li className={reply ? "" : "card p-4"}>
      <div className="flex items-center gap-3">
        <Avatar name={comment.author.name} src={comment.author.avatar} />

        <div className="min-w-0 flex-1">
          <Link
            href={`/profiles/${comment.author.id}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {comment.author.name}
          </Link>
          <p className="text-[11px] text-ink-400">{ago(comment.createdAt)}</p>
        </div>

        {comment.own && (
          <button
            type="button"
            disabled={pending}
            onClick={() => props.onDelete(comment.id)}
            aria-label="Delete comment"
            title="Delete comment"
            className="shrink-0 rounded-lg p-1.5 text-ink-500 transition hover:text-red-400 disabled:opacity-60"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <p className="mt-2.5 text-sm leading-relaxed whitespace-pre-wrap text-ink-200">
        {comment.body}
      </p>

      {/* What has been said with an emoji, then a way to add one. Splitting the
          two keeps the row short: six pale options under every comment is a
          keyboard rather than a reaction. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {comment.reactions.map((reaction) => (
          <button
            key={reaction.emoji}
            type="button"
            disabled={!signedIn || pending}
            aria-pressed={reaction.mine}
            onClick={() => props.onReact(comment.id, reaction.emoji)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition disabled:opacity-60 ${
              reaction.mine
                ? "border-flare-500/70 bg-flare-600/20 text-flare-300"
                : "border-ink-700 text-ink-300 hover:border-flare-500"
            }`}
          >
            <span aria-hidden>{reaction.emoji}</span>
            <span className="font-mono tabular-nums">{reaction.count}</span>
          </button>
        ))}

        {signedIn && (
          <details className="relative">
            <summary className="inline-flex cursor-pointer list-none items-center rounded-full border border-ink-700 px-2 py-0.5 text-xs text-ink-400 transition hover:border-flare-500 hover:text-ink-100">
              React
            </summary>
            <div className="absolute z-20 mt-1 flex gap-1 rounded-xl border border-ink-700 bg-ink-850 p-1.5 shadow-lg shadow-black/40">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  disabled={pending}
                  onClick={() => props.onReact(comment.id, emoji)}
                  className="rounded-lg px-1.5 py-1 text-base transition hover:bg-white/10 disabled:opacity-60"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </details>
        )}

        {/* Only a comment can be answered — a reply cannot, so it is offered
            nothing to answer with. */}
        {signedIn && !reply && (
          <button
            type="button"
            onClick={() => props.onToggleReply(comment.id)}
            className="ml-auto text-xs font-medium text-flare-400 transition hover:text-flare-300"
          >
            Reply
          </button>
        )}
      </div>

      {comment.replies.length > 0 && (
        <ul className="mt-3 space-y-3 border-l border-ink-800 pl-3">
          {comment.replies.map((child) => (
            <CommentItem key={child.id} {...props} comment={child} reply />
          ))}
        </ul>
      )}

      {props.replyTo === comment.id && (
        <div className="mt-3 border-l border-ink-800 pl-3">
          <textarea
            value={props.replyDraft}
            maxLength={2000}
            disabled={pending}
            onChange={(e) => props.onReplyDraft(e.target.value)}
            placeholder={`Reply to ${comment.author.name}…`}
            className={`min-h-20 ${BOX}`}
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => props.onToggleReply(comment.id)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:text-ink-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !props.replyDraft.trim()}
              onClick={() => props.onSendReply(comment.id)}
              className={SEND}
            >
              Reply
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export function TitleComments({
  mediaType,
  tmdbId,
  comments,
  signedIn,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  comments: CommentNode[];
  signedIn: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Nothing written, and nothing to write with: no empty heading.
  if (!signedIn && comments.length === 0) return null;

  const thing = mediaType === "tv" ? "show" : "film";

  /**
   * Every write here follows the same shape: `pending` covers the write and
   * the refresh happens outside it. Inside, the controls would stay dead
   * through a whole page re-render after the thing they did had already landed.
   */
  function send(body: string, parentId: string | null, done: () => void) {
    setError(null);

    const write = postComment({ mediaType, tmdbId, body, parentId });
    startTransition(async () => {
      const res = await write;
      if (res.error) setError(res.error);
      else done();
    });
    void write.then(() => router.refresh());
  }

  function remove(id: string) {
    const write = deleteComment(id);
    startTransition(async () => {
      const res = await write;
      if (res.error) setError(res.error);
    });
    void write.then(() => router.refresh());
  }

  function react(commentId: string, emoji: string) {
    const write = toggleReaction({ commentId, emoji });
    startTransition(async () => {
      await write;
    });
    void write.then(() => router.refresh());
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Comments</h2>
        <p className="text-[11px] text-ink-400">Everyone on this instance can read these.</p>
      </div>

      {signedIn && (
        <div className="card p-4">
          <textarea
            value={draft}
            maxLength={2000}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Say something about this ${thing}…`}
            className={`min-h-24 ${BOX}`}
          />
          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              disabled={pending || !draft.trim()}
              onClick={() => send(draft, null, () => setDraft(""))}
              className={SEND}
            >
              Post
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {comments.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              signedIn={signedIn}
              pending={pending}
              onReact={react}
              onDelete={remove}
              replyTo={replyTo}
              onToggleReply={(id) => {
                setReplyTo(replyTo === id ? null : id);
                setReplyDraft("");
              }}
              replyDraft={replyDraft}
              onReplyDraft={setReplyDraft}
              onSendReply={(parentId) =>
                send(replyDraft, parentId, () => {
                  setReplyDraft("");
                  setReplyTo(null);
                })
              }
            />
          ))}
        </ul>
      ) : (
        signedIn && (
          <p className="mt-3 text-sm text-ink-400">
            Nothing yet. Say the first thing about this {thing}.
          </p>
        )
      )}
    </section>
  );
}
