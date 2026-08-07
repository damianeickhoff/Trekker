"use client";

import { Check, Clock, UserMinus, UserPlus, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  sendFriendRequest,
  type FriendActionState,
} from "@/lib/friend-actions";
import type { FriendState } from "@/lib/friends";

const BASE =
  "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-60";
const PRIMARY = `${BASE} bg-flare-600 text-white hover:bg-flare-500`;
const QUIET = `${BASE} border border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100`;

/**
 * The one control that covers every state of a friendship. Which buttons exist
 * is derived from where the viewer stands, so there is never a button that does
 * nothing — a request you sent shows as pending, not as "add" again.
 */
export function FriendButton({
  userId,
  requestId,
  state,
  size = "default",
}: {
  userId: string;
  /** Needed to accept or decline; only present when a request is outstanding. */
  requestId?: string;
  state: FriendState;
  size?: "default" | "compact";
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FriendActionState | null>(null);

  function run(action: () => Promise<FriendActionState>) {
    startTransition(async () => setResult(await action()));
  }

  const scale = size === "compact" ? "px-3 py-1.5 text-xs" : "";

  if (state === "self") return null;

  if (result?.error) {
    return <p className="text-xs text-red-400">{result.error}</p>;
  }

  if (state === "friends") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => removeFriend(userId))}
        className={`${QUIET} ${scale} hover:border-red-500/50 hover:text-red-300`}
      >
        <UserMinus size={15} />
        {pending ? "Removing…" : "Friends"}
      </button>
    );
  }

  if (state === "requested") {
    return (
      <button
        type="button"
        disabled={pending || !requestId}
        onClick={() => requestId && run(() => declineFriendRequest(requestId))}
        title="Withdraw this request"
        className={`${QUIET} ${scale}`}
      >
        <Clock size={15} />
        {pending ? "Cancelling…" : "Requested"}
      </button>
    );
  }

  if (state === "incoming") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !requestId}
          onClick={() => requestId && run(() => acceptFriendRequest(requestId))}
          className={`${PRIMARY} ${scale}`}
        >
          <Check size={15} />
          Accept
        </button>
        <button
          type="button"
          disabled={pending || !requestId}
          onClick={() => requestId && run(() => declineFriendRequest(requestId))}
          className={`${QUIET} ${scale}`}
        >
          <X size={15} />
          Decline
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => run(() => sendFriendRequest(userId))}
      className={`${PRIMARY} ${scale}`}
    >
      <UserPlus size={15} />
      {pending ? "Sending…" : "Add friend"}
    </button>
  );
}
