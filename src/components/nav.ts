import type { IconName } from "./icon";

/** The five tabs, in the order both the tab bar and the sidebar show them. */
export const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/discover", label: "Discover", icon: "compass" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/lists", label: "Lists", icon: "list" },
  { href: "/badges", label: "Badges", icon: "trophy" },
];

/** The sidebar's one entry beyond the tabs: News, under Calendar, with its unread count (T2). A phone reaches it from Home. */
export const SIDEBAR_NEWS = { href: "/news", label: "News", icon: "newspaper" as IconName, after: "/calendar" };

/**
 * The phone's tab bar: the five tabs with News in Badges' place, since a phone
 * has no sidebar to reach News from. Badges is in the account menu there.
 */
export const PHONE_TABS: { href: string; label: string; icon: IconName }[] = [
  ...NAV.filter((n) => n.href !== "/badges"),
  { href: "/news", label: "News", icon: "newspaper" },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Tab pages carry the floating tab bar on phones. Detail pages (a title,
 * search, settings, a list) have a back button instead and give the artwork the whole
 * screen. Profile is reached from the avatar but is still a top-level page.
 */
export function showsTabBar(pathname: string) {
  // Inside Lists (a list, the watchlist in full, the editor) is detail: the
  // mockups draw those without the bar, and the editor keeps its Save there.
  if (pathname.startsWith("/lists/")) return false;
  // Inside Discover likewise: a category, a genre, and the quiz and its
  // results, which the mockups draw full-screen with their own way out.
  if (pathname.startsWith("/discover/")) return false;
  // The profile itself, not what is below it (editing it has its own Save).
  // Badges keeps the bar though it left it: it is still a top-level page, reached from the account menu.
  return [...NAV, ...PHONE_TABS].some((n) => isActive(pathname, n.href)) || pathname === "/profile";
}
