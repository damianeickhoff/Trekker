/**
 * A channel for "this episode's watch state just changed".
 *
 * The "watch next" row and the season list below it are two views of the same
 * facts, held in two components that never meet: one is a rail near the top of
 * the Episodes tab, the other is inside a collapsible card further down, and
 * neither is an ancestor of the other. Ticking an episode in one left the other
 * showing the old answer until the page was reloaded.
 *
 * The alternative was lifting the whole watched set into a shared store and
 * rewriting both components around it. This is smaller and says the same thing:
 * whoever changes something announces it, and whoever is showing it listens.
 * Each view keeps owning its own state — which matters, because they hold it in
 * different shapes for different reasons.
 *
 * Optimistic by design. Both sides apply the change locally before the server
 * has confirmed it, and both revalidate afterwards; this only carries the guess
 * across so the two guesses agree.
 */

export type EpisodeChange = {
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
};

const listeners = new Set<(changes: EpisodeChange[]) => void>();

/** Announce one change, or a run of them — catching up marks many at once. */
export function publishEpisodeChanges(changes: EpisodeChange[]) {
  if (changes.length === 0) return;
  for (const listener of listeners) listener(changes);
}

export function onEpisodeChange(listener: (changes: EpisodeChange[]) => void) {
  listeners.add(listener);
  // Returns nothing, so it can be handed straight back from a `useEffect`
  // without the set's own return value being mistaken for a cleanup result.
  return () => {
    listeners.delete(listener);
  };
}
