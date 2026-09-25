import { EmptyState } from "../empty-state";
import { Icon } from "../icon";
import { Link } from "../link";
import { buttonClass } from "../ui";

/**
 * Home before anything has been watched or saved: a greeting and the three
 * ways to start, in place of the Up next card. Plex and Trakt lead to their
 * rows in Settings, which is where step 9 connects them.
 */
export function FirstRun({ name }: { name: string }) {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <section aria-labelledby="first-run" className="order-2 flex flex-col gap-[22px] lg:gap-6">
      <div className="flex flex-col gap-1.5">
        <h2 id="first-run" className="m-0 font-display text-[30px] font-extrabold leading-[0.98] tracking-[-0.035em]">
          Hello, {first}.
        </h2>
        <p className="m-0 text-sm text-ink-2">Nothing watched yet. Three ways to change that.</p>
      </div>
      <div className="flex flex-col gap-[22px] lg:grid lg:grid-cols-3 lg:gap-6">
        <EmptyState
          icon="search"
          title="Find something you have seen"
          action={
            <Link href="/search" className={buttonClass("primary", "sm")}>
              <Icon name="search" size={18} />
              Search
            </Link>
          }
        >
          Mark a film or a show watched and the rest of the app wakes up: Up next, the calendar, your stats.
        </EmptyState>
        <EmptyState
          icon="play"
          title="Connect Plex"
          action={
            <Link href="/settings/connections" className={buttonClass("ghost", "sm")}>
              <Icon name="play" size={18} />
              Link Plex
            </Link>
          }
        >
          Sign in with Plex and plays log themselves the moment they happen.
        </EmptyState>
        <EmptyState
          icon="list"
          title="Import from Trakt"
          action={
            <Link href="/settings/connections" className={buttonClass("ghost", "sm")}>
              Import
            </Link>
          }
        >
          Bring years of history across in one go.
        </EmptyState>
      </div>
    </section>
  );
}
