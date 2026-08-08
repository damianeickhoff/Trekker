import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getWatchStatuses } from "@/lib/stats";
import type { NormalisedItem } from "@/lib/tmdb";
import { MediaCard } from "./media-card";

/**
 * A page of posters, with the watched marks arriving after them.
 *
 * The marks are the expensive part by a wide margin: working out how far along
 * you are with a show means asking TMDB how many episodes it has, once per show
 * in your library. Awaiting that before rendering meant a grid of posters — the
 * entire point of the page — waited on a fan-out that has nothing to do with any
 * of them.
 *
 * So the grid renders immediately without marks, and the same grid with marks
 * replaces it when the answer lands. The posters are identical either way, so
 * what the reader sees is corner badges appearing on a page that is already
 * there, rather than a page that is not.
 */
export function PosterGrid({ items }: { items: NormalisedItem[] }) {
  return (
    <Suspense fallback={<Grid items={items} />}>
      <MarkedGrid items={items} />
    </Suspense>
  );
}

async function MarkedGrid({ items }: { items: NormalisedItem[] }) {
  const user = await getCurrentUser();
  const statuses = user ? await getWatchStatuses(user.id) : undefined;

  return <Grid items={items} statuses={statuses} />;
}

function Grid({
  items,
  statuses,
}: {
  items: NormalisedItem[];
  statuses?: Map<string, Parameters<typeof MediaCard>[0]["status"]>;
}) {
  return (
    <div className="mt-6 grid grid-cols-3 gap-x-1.5 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {items.map((item) => (
        <MediaCard
          key={`${item.mediaType}-${item.id}`}
          item={item}
          status={statuses?.get(`${item.mediaType}-${item.id}`)}
        />
      ))}
    </div>
  );
}
