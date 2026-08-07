/**
 * Black, and nothing else.
 *
 * The route fetches a dozen titles from TMDB before it can draw anything, and
 * the default would be the page it was opened from with a spinner on it — the
 * header, the tab bar and the dashboard, all of which the screensaver exists to
 * get rid of. This carries `.screensaver` for exactly that reason: the class is
 * what the stylesheet keys the chrome off, so the window goes dark the instant
 * it is asked for and stays that way until there is artwork to put on it.
 *
 * Deliberately without a skeleton. A screensaver arriving as a set of grey
 * rectangles is worse than one arriving a beat late.
 */
export default function Loading() {
  return <div className="screensaver fixed inset-0 z-[60] bg-black" />;
}
