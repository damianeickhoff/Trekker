import { redirect } from "next/navigation";
import Link from "next/link";
import { Dices, Settings2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getTonight, parseFilters, shuffle, type TonightPick } from "@/lib/tonight";
import { MediaCard } from "@/components/media-card";
import { EmptyState, SectionTitle } from "@/components/ui";
import { TonightFilterBar } from "@/components/tonight-filters";

export const metadata = { title: "Tonight · Trekker" };

type Search = { runtime?: string; kind?: string; streaming?: string; roll?: string };

/**
 * The watchlist asked the other way round.
 *
 * A watchlist answers "what did I mean to watch"; on a given evening the real
 * question is narrower — how long have I got, and what can I actually put on
 * right now. Both of those are already cached on the rows, so this is a filter
 * rather than anything new.
 */
export default async function TonightPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const filters = parseFilters(params);
  const tonight = await getTonight(user.id, filters);

  // The roll lives in the URL so the same three survive a refresh, and change
  // only when the viewer asks for three more.
  const roll = Number(params.roll) || 1;
  const suggestions = shuffle(tonight.picks, roll, 3);

  const query = new URLSearchParams();
  if (params.runtime) query.set("runtime", params.runtime);
  if (params.kind) query.set("kind", params.kind);
  if (params.streaming) query.set("streaming", params.streaming);
  query.set("roll", String(roll + 1));

  return (
    <div className="rise">
      <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
        From your watchlist
      </p>
      <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
        What should I watch tonight?
      </h1>
      <p className="mt-1.5 text-sm text-ink-400">
        {tonight.total === 0
          ? "Your watchlist is empty, so there is nothing to choose between yet."
          : `${tonight.picks.length} of ${tonight.total} on your watchlist fit.`}
      </p>

      <div className="mt-5">
        <TonightFilterBar filters={filters} noProviders={tonight.noProviders} />
      </div>

      {tonight.total === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing on the list"
            body="Add a few films and shows you mean to get to, and this page will pick between them."
            href="/discover"
            cta="Find something"
          />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing fits"
            body={
              filters.streamableOnly
                ? "Nothing on your watchlist is on one of your services right now. Try turning that filter off."
                : "Nothing on your watchlist is that short. Try allowing a bit more time."
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8 mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Three to choose from</h2>
            <Link
              href={`/tonight?${query.toString()}`}
              scroll={false}
              className="inline-flex items-center gap-1.5 text-sm text-flare-400 hover:text-flare-500"
            >
              <Dices size={15} />
              Roll again
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {suggestions.map((pick) => (
              <Pick key={pick.id} pick={pick} />
            ))}
          </div>
        </>
      )}

      {tonight.unknownLength.length > 0 && (
        <>
          <SectionTitle>Length not known yet</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-ink-400">
            These match everything else, but nobody has looked up how long they are — that
            fills itself in as you visit your watchlist.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tonight.unknownLength.slice(0, 10).map((pick) => (
              <Pick key={pick.id} pick={pick} compact />
            ))}
          </div>
        </>
      )}

      <p className="mt-10 flex items-center gap-1.5 text-xs text-ink-500">
        <Settings2 size={13} />
        Your services are set in{" "}
        <Link href="/settings" className="text-flare-400 hover:text-flare-500">
          settings
        </Link>
        .
      </p>
    </div>
  );
}

function Pick({ pick, compact = false }: { pick: TonightPick; compact?: boolean }) {
  return (
    <div>
      <MediaCard
        item={{
          id: pick.tmdbId,
          mediaType: pick.mediaType,
          title: pick.title,
          poster: pick.poster,
          backdrop: null,
          score: pick.score ?? 0,
          year: null,
          overview: "",
        }}
      />
      {!compact && (
        <p className="mt-1.5 line-clamp-1 text-xs text-ink-400">
          {pick.runtime ? `${pick.runtime} min` : "length unknown"}
          {pick.onServices.length > 0 && ` · ${pick.onServices.join(", ")}`}
        </p>
      )}
    </div>
  );
}
