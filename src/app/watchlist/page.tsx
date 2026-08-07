import Link from "next/link";
import { redirect } from "next/navigation";
import { Dices, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getListsOverview } from "@/lib/lists";
import { getRequestMarks } from "@/lib/request-marks";
import { ListCardRail } from "@/components/list-card";
import { ListRail } from "@/components/list-rail";
import { NewListButton } from "@/components/new-list-button";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Lists — Trekker" };

/**
 * The size every control on a section heading wears.
 *
 * These belong to the row they stand beside rather than to the page, and at
 * full button size they competed with the heading itself. `whitespace-nowrap`
 * keeps a two-word label on one line when the heading beside it is long.
 */
const HEADING_BUTTON =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition";

/**
 * Everything you keep, in four rows.
 *
 * The watchlist and the favourites are rows of titles: each is one list, and
 * what you want from it is to see what is on it. The lists you made are rows of
 * *lists* — one tile apiece — because there is no limit on how many there might
 * be, and a page that grew a full-width rail per list would stop being an
 * overview at about the fourth one. Opening a tile is where the titles are.
 */
export default async function ListsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The overview refreshes any smart list that has aged out on its way in, so
  // what is below is never yesterday's answer even on an instance where nobody
  // set the nightly job up.
  const [lists, requests] = await Promise.all([getListsOverview(user.id), getRequestMarks()]);

  const newSmartList = (
    <Link
      href="/watchlist/new"
      className={`${HEADING_BUTTON} border border-fresh-500/50 bg-fresh-500/10 text-fresh-500 hover:border-fresh-500 hover:bg-fresh-500/20`}
    >
      <Sparkles size={14} />
      New smart list
    </Link>
  );

  return (
    <div className="rise">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Lists</h1>
        <p className="mt-1 text-sm text-ink-400">
          What you mean to watch, what you loved, and whatever else you keep track of.
        </p>
      </div>

      <ListRail
        list={lists.watchlist}
        requests={requests}
        // On the watchlist's own heading rather than at the top of the page: it
        // picks something off the watchlist and nothing else, and a button
        // floating above four rails reads as belonging to all of them.
        action={
          lists.watchlist.count > 0 ? (
            <Link
              href="/tonight"
              className={`${HEADING_BUTTON} bg-flare-600 font-semibold text-white hover:bg-flare-500`}
            >
              <Dices size={14} />
              Pick for me
            </Link>
          ) : null
        }
        empty={
          <>
            Hit <span className="text-ink-200">Save</span> on any film or show and it turns up
            here.{" "}
            <Link href="/discover" className="text-flare-400 hover:text-flare-500">
              Find something
            </Link>
          </>
        }
      />

      <ListCardRail
        kind="manual"
        title="My lists"
        description="Lists you fill yourself, from the Save button on any title."
        lists={lists.manual}
        action={<NewListButton />}
        empty={
          <div className="card px-5 py-8 text-center text-sm text-ink-400">
            No lists of your own yet. Make one and it turns up on the Save button everywhere.
          </div>
        }
      />

      <ListCardRail
        kind="smart"
        title="Smart lists"
        description="Standing questions. Each one rebuilds itself once a day."
        lists={lists.smart}
        action={newSmartList}
        empty={
          <EmptyState
            title="Let a list fill itself"
            body="Pick a genre, a decade, a score, where it streams — and get a list that keeps answering that question as new things come out."
            href="/watchlist/new"
            cta="Build one"
          />
        }
      />

      {/* Last, deliberately. The three above are all about what you have not
          watched yet, which is what anybody opens this page for; favourites are
          a record of what you already loved, and belong at the end of that
          thought rather than in the middle of it. */}
      <ListRail
        list={lists.favourites}
        requests={requests}
        empty="Press the heart on a title page and it lands here."
      />
    </div>
  );
}
