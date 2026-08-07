import Link from "next/link";
import { CATEGORIES, SEASON_PICKS, type CategorySlug } from "@/lib/catalogue";
import type { Season } from "@/lib/seasons";

const ORDER: CategorySlug[] = [
  "trending",
  "popular-tv",
  "popular-movies",
  "in-cinemas",
  "upcoming-tv",
  "new-shows",
  "upcoming",
  "top-rated-movies",
  "top-rated-tv",
];

const SHORT: Record<CategorySlug, string> = {
  trending: "Trending",
  "popular-tv": "Popular shows",
  "popular-movies": "Popular movies",
  "in-cinemas": "In cinemas",
  "upcoming-tv": "Upcoming shows",
  upcoming: "Coming soon",
  "new-shows": "New shows",
  "top-rated-movies": "Top movies",
  "top-rated-tv": "Top shows",

  "scifi-films": "Sci-fi films",
  "scifi-essential": "Essential sci-fi",
  "scifi-retro": "Retro futures",
  "scifi-animated": "Animated futures",
  "scifi-series": "Sci-fi series",
  "horror-fresh": "New horror",
  "horror-scariest": "Scariest ever",
  "horror-classics": "Horror classics",
  "horror-funny": "Horror comedy",
  "horror-series": "Horror series",
  "holiday-films": "Christmas films",
  "holiday-best": "Best of Christmas",
  "holiday-family": "Family films",
  "holiday-animated": "Animated and cosy",
  "holiday-series": "Festive series",
};

/** Which categories are worth offering once the page is narrowed to one medium. */
const BY_TYPE: Record<"all" | "tv" | "movie", CategorySlug[]> = {
  all: ORDER,
  tv: ["trending", "popular-tv", "new-shows", "upcoming-tv", "top-rated-tv"],
  movie: ["trending", "popular-movies", "in-cinemas", "upcoming", "top-rated-movies"],
};

/** Category chips, shared by the discover page and each category page. */
export function CategoryNav({
  active,
  type = "all",
  season = null,
}: {
  active?: CategorySlug;
  type?: "all" | "tv" | "movie";
  /** In season, that season's collections lead the row and are marked. */
  season?: Season | null;
}) {
  const seasonal: CategorySlug[] = season
    ? SEASON_PICKS[season].filter(
        (slug) => type === "all" || CATEGORIES[slug].fallbackType === type,
      )
    : [];

  // A seasonal chip reached out of season still works, so an active one is
  // kept in the row even when its month has passed.
  const rest = BY_TYPE[type].filter((slug) => !seasonal.includes(slug));
  const orphan = active && !seasonal.includes(active) && !rest.includes(active) ? [active] : [];

  return (
    // One scrolling row on a phone, wrapping once there is width for it. Eight
    // chips wrapped onto three lines took a third of a small screen to say
    // something nobody had asked for yet — sideways they cost one line and
    // still show there is more by running off the edge.
    <nav className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
      {[...orphan, ...seasonal, ...rest].map((slug) => {
        const isSeasonal = seasonal.includes(slug);

        return (
          <Link
            key={slug}
            href={`/discover/${slug}`}
            aria-current={slug === active ? "page" : undefined}
            title={CATEGORIES[slug].title}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition ${
              slug === active
                ? "border-flare-500 bg-flare-600/20 text-ink-100"
                : isSeasonal
                  ? "border-flare-500/50 text-flare-300 hover:bg-flare-600/15 hover:text-ink-100 light:text-flare-600"
                  : "border-ink-700 text-ink-300 hover:border-flare-500 hover:bg-ink-800 hover:text-ink-100"
            }`}
          >
            {SHORT[slug]}
          </Link>
        );
      })}
    </nav>
  );
}
