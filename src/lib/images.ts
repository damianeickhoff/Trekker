/**
 * TMDB image URL builders. Deliberately free of `server-only` — these are pure
 * string helpers, and client components need them too.
 */
export const img = {
  poster: (p?: string | null, size: "w185" | "w342" | "w500" | "w780" = "w342") =>
    p ? `https://image.tmdb.org/t/p/${size}${p}` : null,
  backdrop: (p?: string | null, size: "w780" | "w1280" | "original" = "w1280") =>
    p ? `https://image.tmdb.org/t/p/${size}${p}` : null,
  profile: (p?: string | null) => (p ? `https://image.tmdb.org/t/p/w185${p}` : null),
  still: (p?: string | null, size: "w300" | "w780" = "w300") =>
    p ? `https://image.tmdb.org/t/p/${size}${p}` : null,
  /**
   * A title treatment — the film's own lettering, on transparency. `w500` is
   * the largest fixed width TMDB offers for these; `original` is worth asking
   * for only when the logo is an SVG, where the size segment is ignored.
   */
  logo: (p?: string | null, size: "w185" | "w300" | "w500" | "original" = "w500") =>
    p ? `https://image.tmdb.org/t/p/${size}${p}` : null,
};
