"use client";

import { KeyRound, Loader2, Trash2, UserPen } from "lucide-react";
import { useState, useTransition } from "react";
import { removeAccount, renameAccount, resetAccountPassword } from "@/lib/admin-actions";

type Account = {
  id: string;
  name: string;
  email: string;
  managed: boolean;
  plexLinked: boolean;
  hasPassword: boolean;
};

/**
 * The admin's account tool: rename, set a new password, remove.
 *
 * It exists for the problems a household instance cannot otherwise solve —
 * above all somebody forgetting their password on a server with no email to
 * send a reset through. The admin's own account is deliberately absent: their
 * password change proves the current password and their delete guards the
 * instance settings, and this panel must not be the way around either.
 */
export function AdminAccounts({
  accounts,
  self,
}: {
  accounts: Account[];
  /** The admin's own id, which the picker leaves out. */
  self: string;
}) {
  const others = accounts.filter((account) => account.id !== self);

  const [userId, setUserId] = useState(others[0]?.id ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = others.find((account) => account.id === userId);

  if (others.length === 0) {
    return (
      <p className="py-3 text-sm text-ink-400">
        Nobody else is on this instance yet. Accounts turn up here as people join.
      </p>
    );
  }

  function pick(id: string) {
    setUserId(id);
    setName("");
    setPassword("");
    setConfirm("");
    setNote(null);
  }

  function saveRename() {
    startTransition(async () => {
      const result = await renameAccount(userId, name);
      setNote(result.error ?? `Renamed to ${name.trim()}.`);
      if (result.ok) setName("");
    });
  }

  function savePassword() {
    startTransition(async () => {
      const result = await resetAccountPassword(userId, password);
      setNote(
        result.error ??
          `${chosen?.name ?? "The account"} has a new password, and is signed out everywhere.`,
      );
      if (result.ok) setPassword("");
    });
  }

  function saveRemove() {
    startTransition(async () => {
      const result = await removeAccount(userId, confirm);
      if (result.ok) {
        setNote(`${chosen?.name ?? "The account"} is gone, along with everything it logged.`);
        const next = others.find((account) => account.id !== userId);
        setUserId(next?.id ?? "");
        setConfirm("");
      } else {
        setNote(result.error ?? "That did not work");
      }
    });
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-xs text-ink-400">Account</span>
        <select
          value={userId}
          onChange={(event) => pick(event.target.value)}
          className="w-full rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2.5 text-sm outline-none focus:border-flare-500"
        >
          {others.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} — {account.email}
            </option>
          ))}
        </select>
      </label>

      {chosen && (
        <p className="text-xs text-ink-400">
          Signs in with{" "}
          {[chosen.hasPassword && "a password", chosen.plexLinked && "Plex"]
            .filter(Boolean)
            .join(" and ") || "nothing yet"}
          {chosen.managed && " — a managed Plex Home profile"}.
        </p>
      )}

      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs text-ink-400">
          <UserPen size={13} />
          Rename
        </span>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={chosen?.name}
            maxLength={60}
            className="min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-flare-500"
          />
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={saveRename}
            className="rounded-xl border border-ink-700 px-3.5 py-2 text-sm text-ink-200 transition hover:border-flare-500 hover:bg-ink-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs text-ink-400">
          <KeyRound size={13} />
          Set a new password
        </span>
        {chosen?.managed ? (
          <p className="text-xs text-ink-500">
            A managed profile has no sign-in of its own, so there is no password to set.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-flare-500"
              />
              <button
                type="button"
                disabled={pending || password.length < 8}
                onClick={savePassword}
                className="rounded-xl border border-ink-700 px-3.5 py-2 text-sm text-ink-200 transition hover:border-flare-500 hover:bg-ink-800 disabled:opacity-50"
              >
                Set
              </button>
            </div>
            <p className="text-[11px] text-ink-500">
              For somebody locked out. It ends every session they had, and they can change it
              themselves once they are back in.
            </p>
          </>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="flex items-center gap-1.5 text-xs text-red-400 light:text-red-600">
          <Trash2 size={13} />
          Remove this account
        </span>
        <div className="flex gap-2">
          <input
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={`Type "${chosen?.name ?? ""}" to confirm`}
            className="min-w-0 flex-1 rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <button
            type="button"
            disabled={
              pending ||
              !chosen ||
              confirm.trim().toLowerCase() !== chosen.name.trim().toLowerCase()
            }
            onClick={saveRemove}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-sm font-medium text-red-400 transition hover:border-red-500/60 hover:bg-red-500/20 disabled:opacity-50 light:text-red-600"
          >
            Remove
          </button>
        </div>
        <p className="text-[11px] text-ink-500">
          Everything they logged goes with it — plays, lists, ratings, friendships — and there
          is no undo. Their export under Settings is the only safety net.
        </p>
      </div>

      {pending && (
        <p className="flex items-center gap-2 text-xs text-ink-400">
          <Loader2 size={13} className="animate-spin" />
          Working…
        </p>
      )}
      {note && !pending && <p className="text-xs text-flare-400">{note}</p>}
    </div>
  );
}
