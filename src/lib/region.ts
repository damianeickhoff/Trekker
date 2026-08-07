/**
 * Which country's streaming availability to show.
 *
 * Availability is per country and there is nothing in a TMDB key to infer it
 * from, so it is configured once for the instance via `WATCH_REGION` — an
 * ISO 3166-1 country code such as `NL`, `GB` or `US`.
 */
export function watchRegion() {
  const configured = process.env.WATCH_REGION?.trim().toUpperCase();
  return configured && /^[A-Z]{2}$/.test(configured) ? configured : "US";
}
