import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ListChecks, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { formatWatched } from "@/lib/dates";
import { getList } from "@/lib/lists";
import { getRequestMarks } from "@/lib/request-marks";
import { ListGrid } from "@/components/list-grid";
import { ListMenu } from "@/components/list-menu";
import { EmptyState } from "@/components/ui";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) return { title: "Lists — Trekker" };

  const { id } = await params;
  const list = await getList(user.id, id);
  return { title: list ? `${list.name} — Trekker` : "Lists — Trekker" };
}

export default async function ListPage({ params }: { params: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  // Rebuilds a stale smart list on the way in, so what is shown is today's
  // answer even if the nightly job never ran.
  const [list, requests] = await Promise.all([getList(user.id, id), getRequestMarks()]);
  if (!list) notFound();

  const smart = list.kind === "smart";
  const Icon = smart ? Sparkles : ListChecks;

  return (
    <div className="rise">
      <Link
        href="/watchlist"
        className="inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ArrowLeft size={15} />
        All lists
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Icon size={22} className={smart ? "text-fresh-500" : "text-ink-400"} />
            <span className="truncate">{list.name}</span>
          </h1>
          <p className="mt-1 text-sm text-ink-400">{list.description}</p>
          {smart && list.refreshedAt && (
            <p className="mt-0.5 text-xs text-ink-500">
              Rebuilt {formatWatched(list.refreshedAt)} · updates itself once a day
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {smart && (
            <Link
              href={`/watchlist/list/${list.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-600/70 bg-ink-900/50 px-4 py-2.5 text-sm font-medium text-ink-100 transition hover:border-flare-500 hover:bg-ink-800 light:border-ink-600 light:bg-white/85"
            >
              Edit filters
            </Link>
          )}
          <ListMenu
            listId={list.id}
            name={list.name}
            kind={list.kind === "smart" ? "smart" : "manual"}
            redirectTo="/watchlist"
          />
        </div>
      </div>

      {list.items.length === 0 ? (
        <div className="mt-6">
          {smart ? (
            <EmptyState
              title="Nothing matches these filters"
              body="TMDB has nothing that fits all of them at once. Widening the score or the years is usually enough."
              href={`/watchlist/list/${list.id}/edit`}
              cta="Edit filters"
            />
          ) : (
            <EmptyState
              title="This list is empty"
              body="Hit Save on any film or show and tick this list."
              href="/discover"
              cta="Find something"
            />
          )}
        </div>
      ) : (
        <ListGrid
          items={list.items}
          // Only a manual list can have titles taken off it: what is on a smart
          // one is the answer to its filters, and would come straight back.
          removeFrom={smart ? undefined : list.id}
          // And only a smart list has anything to fetch: it caches sixty, and
          // scrolling past them re-runs the query deeper. A manual list is
          // already whole, so scrolling there only reveals what is loaded.
          loadMoreFrom={smart ? list.id : undefined}
          requests={Object.fromEntries(requests)}
        />
      )}
    </div>
  );
}
