import Image from "next/image";
import { findOnPlex, getPlexConnection } from "@/lib/plex";
import { getWatchProviders, img, type MediaType, type WatchProvider } from "@/lib/tmdb";
import { watchRegion } from "@/lib/region";
import { PlexOpen } from "./plex-open";

/**
 * Where a title is streaming right now — your own server first, then TMDB's
 * JustWatch feed.
 *
 * Plex leads because it is the answer that ends the question: if it is already
 * on the server there is nothing to decide. It used to be a button up in the
 * hero row with a "Not on Plex" state, which spent a full-sized control saying
 * nothing — the absence of the chip says it now, in no space at all.
 *
 * Subscription streaming only for the rest. Rent and buy are a different
 * decision — money, not "can I put this on tonight" — and the free/ad-supported
 * list is noisy enough to bury the answer. This is a strip under the hero rather
 * than a section of its own, because it answers a question people have *before*
 * they scroll.
 *
 * Renders nothing when nobody carries it, so a title with no offers leaves no
 * empty heading behind.
 */
export async function StreamingStrip({
  mediaType,
  tmdbId,
  userId,
  title,
  year,
}: {
  mediaType: MediaType;
  tmdbId: number;
  /** Signed out, there is no Plex server to check against. */
  userId: string | null;
  title: string;
  year: string | null;
}) {
  const [offers, plex] = await Promise.all([
    getWatchProviders(mediaType, tmdbId, watchRegion()),
    findPlex(userId, mediaType, title, year),
  ]);

  // TMDB lists some providers under more than one tier.
  const providers = [...new Map((offers?.stream ?? []).map((p) => [p.provider_id, p])).values()];
  if (providers.length === 0 && !plex) return null;

  return (
    <div className="flex flex-wrap items-center justify-start gap-2">
      <span className="ios-bright text-[11px] font-medium tracking-wider text-ink-400 uppercase">
        {plex ? "Watch on" : "Streaming on"}
      </span>

      {plex && (
        <PlexOpen
          webHref={plex.href}
          appHref={plex.appHref}
          title={
            plex.librarySection
              ? `In your "${plex.librarySection}" library`
              : "In your Plex library"
          }
          // Deliberately the same chip as the streaming services beside it.
          // They are answers to one question — where can I put this on — and
          // giving your own server a louder shape than Netflix made the row
          // read as two unrelated things.
          className="flex items-center transition hover:opacity-80"
        >
          <PlexMark />
        </PlexOpen>
      )}

      {/* Marks rather than names, and no chip around them. A service's logo is
          the thing people actually recognise — nobody reads "Netflix" off a row
          of chips, they spot the red — and once the words were gone the panel
          each one sat in was a box drawn around a box. The name stays on the
          element for anyone who needs it read aloud or hovered. */}
      {providers.map((provider) => (
        <span
          key={provider.provider_id}
          title={provider.provider_name}
          aria-label={provider.provider_name}
          className="flex items-center"
        >
          <ProviderLogo provider={provider} />
        </span>
      ))}
    </div>
  );
}

/** The viewer's Plex library, when they have one connected. */
async function findPlex(
  userId: string | null,
  mediaType: MediaType,
  title: string,
  year: string | null,
) {
  if (!userId) return null;

  const connection = await getPlexConnection();
  if (!connection) return null;

  return findOnPlex(connection, { title, year, mediaType });
}

/**
 * Plex's chevron, drawn rather than fetched.
 *
 * Every other logo in this row is a tile from TMDB. Plex is not in that feed —
 * it is the viewer's own server — so an icon from the generic set stood out as
 * the one chip that did not carry a brand. The mark itself is two strokes, and
 * inlining it keeps the row to a single network round trip.
 */
function PlexMark() {
  return (
    <span
      aria-hidden
      className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#1f1f1f] text-[#e5a00d]"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <path d="M6 1.5h6.1L19.7 12l-7.6 10.5H6L13.6 12z" />
      </svg>
    </span>
  );
}

function ProviderLogo({ provider }: { provider: WatchProvider }) {
  const src = img.poster(provider.logo_path, "w185");

  return (
    <span className="relative block h-6 w-6 shrink-0 overflow-hidden rounded-md bg-ink-800">
      {src && <Image src={src} alt="" fill sizes="24px" className="object-cover" />}
    </span>
  );
}
