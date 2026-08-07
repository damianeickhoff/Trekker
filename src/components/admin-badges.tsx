"use client";

import { Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  accountBadges,
  clearAchievement,
  clearAllAchievements,
  clearChallenges,
} from "@/lib/admin-actions";
import { BadgeMedal } from "./achievement-badge";

type Account = { id: string; name: string; email: string };
type Row = Awaited<ReturnType<typeof accountBadges>>[number];

/**
 * The admin's badge tool.
 *
 * Deliberately plain: pick an account, see what it holds, take a badge back.
 * It exists so a wrongly awarded achievement can be undone and so one can be
 * tested twice without a second account — which is why it says, on the panel
 * itself, that the watch history is left alone. Clearing a badge is "this was
 * wrongly awarded", never "this never happened", and anything still true will
 * simply be earned again on the next evaluation.
 */
export function AdminBadges({
  accounts,
  self,
  period,
}: {
  accounts: Account[];
  /** The admin's own id, so the picker can open on them. */
  self: string;
  /** "2026-08" — this month, for clearing challenge wins. */
  period: string;
}) {
  const [userId, setUserId] = useState(self);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The loaded rows carry the account they belong to, so switching accounts
  // reads as "loading" without an effect having to blank them first — which
  // would be a second render for nothing.
  const [loaded, setLoaded] = useState<{ userId: string; rows: Row[] } | null>(null);
  const rows = loaded?.userId === userId ? loaded.rows : null;

  useEffect(() => {
    let live = true;
    void accountBadges(userId).then((result) => {
      if (live) setLoaded({ userId, rows: result });
    });
    return () => {
      live = false;
    };
  }, [userId]);

  function refresh() {
    void accountBadges(userId).then((result) => setLoaded({ userId, rows: result }));
  }

  function clearOne(key: string, name: string) {
    startTransition(async () => {
      const result = await clearAchievement(userId, key);
      setNote(result.error ?? `Cleared ${name}.`);
      refresh();
    });
  }

  function clearEverything() {
    startTransition(async () => {
      const result = await clearAllAchievements(userId);
      setNote(result.error ?? `Cleared ${result.cleared ?? 0} badges.`);
      refresh();
    });
  }

  function clearMonth() {
    startTransition(async () => {
      const result = await clearChallenges(userId, period);
      setNote(result.error ?? `Cleared ${result.cleared ?? 0} challenge wins for ${period}.`);
    });
  }

  const chosen = accounts.find((account) => account.id === userId);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-xs text-ink-400">Account</span>
        <select
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value);
            setNote(null);
          }}
          className="w-full rounded-xl border border-ink-700 bg-ink-900/60 px-3 py-2.5 text-sm outline-none focus:border-flare-500"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {account.id === self ? " (you)" : ""} — {account.email}
            </option>
          ))}
        </select>
      </label>

      {rows === null ? (
        <p className="flex items-center gap-2 py-3 text-sm text-ink-400">
          <Loader2 size={14} className="animate-spin" />
          Reading {chosen?.name ?? "account"}…
        </p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-sm text-ink-400">
          {chosen?.name ?? "This account"} has no badges.
        </p>
      ) : (
        <ul className="divide-y divide-ink-800 rounded-xl border border-ink-800">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 px-3 py-2">
              <BadgeMedal icon={row.icon} tier={row.tier} unlocked percent={100} size={32} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.name}</p>
                <p className="truncate font-mono text-[10px] text-ink-500">
                  {row.key}
                  {row.carried ? " · carried" : " · earned"}
                </p>
              </div>

              <button
                type="button"
                disabled={pending}
                onClick={() => clearOne(row.key, row.name)}
                aria-label={`Clear ${row.name}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-red-500/15 hover:text-red-400 disabled:opacity-50"
              >
                <X size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || (rows?.length ?? 0) === 0}
          onClick={clearEverything}
          className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-sm font-medium text-red-400 transition hover:border-red-500/60 hover:bg-red-500/20 disabled:opacity-50 light:text-red-600"
        >
          <Trash2 size={14} />
          Clear all badges
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={clearMonth}
          className="inline-flex items-center gap-2 rounded-xl border border-ink-700 px-3.5 py-2 text-sm text-ink-200 transition hover:border-flare-500 hover:bg-ink-800 disabled:opacity-50"
        >
          Clear this month&rsquo;s challenges
        </button>
      </div>

      {note && <p className="text-xs text-flare-400">{note}</p>}

      <p className="text-[11px] text-ink-500">
        Only the badge is removed — the watch history behind it is untouched. Anything still
        true will be earned again the next time the board is worked out, which is what makes
        this useful for testing.
      </p>
    </div>
  );
}
