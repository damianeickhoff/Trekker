"use client";

import { useState, useTransition } from "react";
import { acceptRequest, addFriend, removeFriend, removeRequest } from "@/lib/friend-actions";
import type { FriendOutcome } from "@/lib/friends";
import { Icon, type IconName } from "../icon";
import { buttonClass, iconButtonClass, type ButtonKind } from "../ui";

/*
 * The friend buttons. Each runs its action and lets the page re-render from
 * the rows; a refusal (a request withdrawn in the meantime) is said in place.
 */

function useFriendAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<FriendOutcome>) =>
    start(async () => {
      const outcome = await action();
      setError(outcome.ok ? null : outcome.error);
    });
  return { pending, error, run };
}

function ActionButton({
  label,
  icon,
  kind,
  onPress,
  size = "sm",
}: {
  label: string;
  icon?: IconName;
  kind: ButtonKind;
  onPress: () => Promise<FriendOutcome>;
  size?: "sm" | "md";
}) {
  const { pending, error, run } = useFriendAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => run(onPress)} className={buttonClass(kind, size, "h-9! px-4!")}>
        {icon && <Icon name={icon} size={18} />}
        {label}
      </button>
      {error && <span className="text-[11px] text-ink-3">{error}</span>}
    </span>
  );
}

export function AddButton({ userId, kind = "ghost", label = "Add" }: { userId: string; kind?: ButtonKind; label?: string }) {
  return <ActionButton label={label} icon="plus" kind={kind} onPress={() => addFriend(userId)} />;
}

export function CancelButton({ requestId, kind = "ghost" }: { requestId: string; kind?: ButtonKind }) {
  return <ActionButton label="Cancel" kind={kind} onPress={() => removeRequest(requestId)} />;
}

export function RemoveFriendButton({ userId, kind = "ghost" }: { userId: string; kind?: ButtonKind }) {
  return <ActionButton label="Remove friend" kind={kind} onPress={() => removeFriend(userId)} />;
}

/** Accept, and the round cross that declines, side by side. */
export function AnswerButtons({ requestId, onHero = false }: { requestId: string; onHero?: boolean }) {
  const { pending, error, run } = useFriendAction();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => acceptRequest(requestId))}
          className={buttonClass(onHero ? "white" : "primary", "sm", "h-9! px-4!")}
        >
          <Icon name="check" size={18} />
          Accept
        </button>
        <button
          type="button"
          disabled={pending}
          aria-label="Decline"
          onClick={() => run(() => removeRequest(requestId))}
          className={iconButtonClass(onHero ? "glass" : "ghost", "sm", "size-9!")}
        >
          <Icon name="x" size={20} />
        </button>
      </span>
      {error && <span className="text-[11px] text-ink-3">{error}</span>}
    </span>
  );
}
