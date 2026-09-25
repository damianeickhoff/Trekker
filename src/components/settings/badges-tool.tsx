import { TIER_BG } from "../badges/medal";
import { EmptyState } from "../empty-state";
import { Icon } from "../icon";
import { Link } from "../link";
import { buttonClass } from "../ui";
import { UserAvatar } from "../user-avatar";
import type { Account, HeldBadge } from "@/lib/admin";
import { takeBackBadge } from "@/lib/settings-actions";
import { daysAgo, whenLabel } from "@/lib/when";

/*
 * The admin's take-back, as Settings' Badges section: pick an account, see its
 * badges, take one back. Only the unlock row goes (`takeBack` in
 * `lib/admin.ts`); anything still true is earned again on that person's next
 * visit to Badges. The route's layout refuses anyone but the admin before
 * anything streams.
 */

const plural = (n: number) => `${n} ${n === 1 ? "badge" : "badges"}`;

/** "Sunday" within the week, then "Mar 2024": when a badge came is all the row needs to say. */
function earnedLabel(iso: string, now = new Date()) {
  const at = new Date(iso);
  return daysAgo(at, now) < 7
    ? whenLabel(iso, now, { today: "word" })
    : at.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function BadgesTool({ accounts, chosen, badges }: { accounts: Account[]; chosen: Account | undefined; badges: HeldBadge[] }) {
  return (
    <div className="flex flex-col gap-3.5 py-3 lg:gap-[18px] lg:py-0">
      <nav aria-label="Accounts" className="no-scrollbar -my-1 flex gap-2 overflow-x-auto py-1 lg:flex-wrap">
        {accounts.map((a) => (
          <AccountChip key={a.id} account={a} on={a.id === chosen?.id} />
        ))}
      </nav>

      {chosen && (
        <div className="flex items-baseline gap-2.5 lg:hidden">
          <span className="font-display text-lg font-bold tracking-[-0.02em]">{chosen.name}</span>
          <span className="mono-label">{plural(badges.length)}</span>
        </div>
      )}

      {chosen && badges.length > 0 ? (
        <ul aria-label={`${chosen.name}'s badges`} className="m-0 flex list-none flex-col p-0">
          {badges.map((b) => (
            <RevokeRow key={b.key} badge={b} userId={chosen.id} />
          ))}
        </ul>
      ) : (
        <EmptyState icon="trophy" title="No badges to take back">
          {chosen ? `${chosen.name} has not earned anything yet.` : "Nobody is here yet."} Badges arrive as viewings are
          logged, the first with the first thing watched.
        </EmptyState>
      )}

      <p className="m-0 text-xs leading-normal text-ink-3">
        Only the badge goes. The watch history behind it is untouched, so anything still true is earned again on the next
        visit to Badges.
      </p>
    </div>
  );
}

/** An account to choose, as the mockup's chip: their face, their name, and on a desktop their count. */
function AccountChip({ account, on }: { account: Account; on: boolean }) {
  return (
    <Link
      href={`/settings/badges?u=${account.id}`}
      replace
      scroll={false}
      aria-current={on ? "page" : undefined}
      className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full pl-1.5 pr-3 text-[13px] font-semibold lg:h-11 lg:pr-3.5 ${
        on ? "bg-primary text-on-primary" : "bg-surface-2 text-ink lg:bg-surface lg:shadow-elevation"
      }`}
    >
      <span className="inline-flex lg:hidden">
        <UserAvatar id={account.id} name={account.name} src={account.avatar} size={28} />
      </span>
      <span className="hidden lg:inline-flex">
        <UserAvatar id={account.id} name={account.name} src={account.avatar} size={32} />
      </span>
      {account.name}
      <span className="hidden font-mono text-[10px] opacity-60 lg:inline">
        {[account.admin ? "admin" : null, plural(account.badges)].filter(Boolean).join(" · ")}
      </span>
    </Link>
  );
}

/** One badge and its Take back, a form so it works before the page's script has loaded. */
function RevokeRow({ badge, userId }: { badge: HeldBadge; userId: string }) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0 lg:last:border-b">
      <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white ${TIER_BG[badge.tier]}`}>
        <Icon name={badge.icon} size={16} />
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{badge.name}</span>
        <span className="text-xs text-ink-3">Earned {earnedLabel(badge.unlockedAt)}</span>
      </span>
      <form action={takeBackBadge}>
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="key" value={badge.key} />
        <button type="submit" aria-label={`Take back ${badge.name}`} className={buttonClass("ghost", "sm", "h-[34px]! px-3.5!")}>
          <Icon name="x" size={16} />
          Take back
        </button>
      </form>
    </li>
  );
}
