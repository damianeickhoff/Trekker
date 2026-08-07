import { expandProviders, getUserProviders } from "@/lib/providers";
import { watchRegion } from "@/lib/region";
import { getSeerrConnection, getSeerrState } from "@/lib/seerr";
import { getWatchProviders } from "@/lib/tmdb";
import { SeerrButton } from "./seerr-button";

/** Server component: resolves the title's Overseerr status, then hands the
 *  interactive button its starting state. Renders nothing when unconfigured. */
export async function SeerrBadge({
  userId,
  mediaType,
  tmdbId,
  title,
  variant,
}: {
  userId: string | null;
  mediaType: "movie" | "tv";
  tmdbId: number;
  /** Heading for the season picker, when a show opens one. */
  title?: string;
  /** Passed straight through — see `SeerrButton`. */
  variant?: "button" | "menu";
}) {
  if (!userId) return null;

  const connection = await getSeerrConnection();
  if (!connection) return null;

  const state = await getSeerrState(connection, mediaType, tmdbId);
  if (!state) return null;

  // Only worth the lookup when there is something to request — which now
  // includes a show that is only partly on the server, since its missing
  // seasons can be asked for individually.
  const anythingMissing =
    state.kind === "requestable" ||
    (state.seasons?.some((season) => season.kind === "requestable") ?? false);

  const alreadyOn = anythingMissing ? await subscribedProviders(userId, mediaType, tmdbId) : [];

  return (
    <SeerrButton
      mediaType={mediaType}
      tmdbId={tmdbId}
      title={title}
      initialState={state}
      alreadyOn={alreadyOn}
      variant={variant}
    />
  );
}

/** Services the viewer pays for that are already streaming this title. */
async function subscribedProviders(
  userId: string,
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<string[]> {
  const mine = await getUserProviders(userId);
  if (mine.length === 0) return [];

  const offers = await getWatchProviders(mediaType, tmdbId, watchRegion()).catch(() => null);
  if (!offers) return [];

  // Every id that counts as the same subscription, not just the one that was
  // ticked — TMDB lists Prime under several.
  const subscribed = expandProviders(mine);

  return [
    ...new Set(
      offers.stream
        .filter((provider) => subscribed.has(provider.provider_id))
        .map((provider) => provider.provider_name),
    ),
  ];
}
