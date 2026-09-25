/*
 * What each setting currently holds, in one line: the phone's folded cards
 * write it on their closed header, and the desktop's section list writes it
 * under each section's name. Worked out from one bag of facts the page is
 * rendered with and the controls keep current as they change (`facts.tsx`),
 * so a card and the list never disagree, and neither waits on the server.
 */

import { backgroundWords, type BackgroundVariant } from "@/lib/background";

export type ThemeChoice = "light" | "dark" | "system";

export type SettingFacts = {
  theme: ThemeChoice;
  /** What "system" came to on this device; known only once the page has run. */
  resolved: "light" | "dark" | null;
  /** What stands behind every page; plain says nothing in the summaries. */
  background: BackgroundVariant;
  screensaver: number;
  /** The chosen services' names, in the chips' order. */
  services: string[];
  region: string;
  /** The account has no region of its own and follows the instance's. */
  regionDefault: boolean;
  /** This browser's push subscription; null until it has been asked, or where there is none to have. */
  push: "on" | "off" | null;
  friends: boolean;
  challenges: boolean;
  /** Settings › News's "Push me the big ones" (T2's news switch, Round 10's first push row). */
  news: boolean;
  /** Settings › News's "New work from people you follow" (Round 10). */
  newsPeople: boolean;
  /** How many sources this account reads: the instance's feeds switched on, by name, and its own that are on. */
  newsSources: number;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The Appearance card's line: "Dark · artwork background". */
export function themeLine(f: Pick<SettingFacts, "theme" | "resolved" | "background">) {
  const theme = f.theme !== "system" ? cap(f.theme) : f.resolved ? `${cap(f.resolved)} · follows device` : "Follows the device";
  const background = backgroundWords(f.background);
  return background ? `${theme} · ${background}` : theme;
}

export function screensaverLine(minutes: number) {
  return minutes ? `After ${minutes} minutes idle` : "Off";
}

export function servicesLine(names: string[]) {
  return names.length ? names.join(", ") : "None chosen";
}

export function regionLine(f: Pick<SettingFacts, "region" | "regionDefault">) {
  return f.regionDefault ? `${f.region} · this Trekker’s default` : f.region;
}

/** News's pushes have their own section since Round 10 and their own line (`newsLine`), so this names the other two. */
export function notificationsLine(f: Pick<SettingFacts, "push" | "friends" | "challenges">) {
  const list = [f.friends ? "friends" : null, f.challenges ? "challenges" : null].filter(Boolean) as string[];
  const topics = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : (list[0] ?? "");
  const what = topics ? `Airing today, ${topics}` : "Airing today only";
  if (f.push === "off") return "Push is off on this device";
  return f.push === "on" ? `Push on here · ${what.toLowerCase()}` : what;
}

/** The desktop list's line under Appearance: "Dark · screensaver 10 min". */
export function appearanceLine(f: Pick<SettingFacts, "theme" | "resolved" | "background" | "screensaver">) {
  const theme = f.theme === "system" ? (f.resolved ? `${cap(f.resolved)}, follows device` : "Follows device") : cap(f.theme);
  const background = backgroundWords(f.background);
  return [theme, background, f.screensaver ? `screensaver ${f.screensaver} min` : "no screensaver"].filter(Boolean).join(" · ");
}

/** "Plex, Overseerr · Trakt not linked": the linked first, then what is not. */
export function connectionsLine(linked: Record<string, boolean>) {
  const on = Object.keys(linked).filter((k) => linked[k]);
  const off = Object.keys(linked).filter((k) => !linked[k]);
  if (on.length === 0) return "Nothing linked yet";
  return off.length ? `${on.join(", ")} · ${off.join(", ")} not linked` : on.join(", ");
}

/** Settings › News's line (Round 10): "5 sources · big ones pushed". */
export function newsLine(f: Pick<SettingFacts, "newsSources" | "news" | "newsPeople">) {
  const sources = f.newsSources === 0 ? "No sources" : `${f.newsSources} ${f.newsSources === 1 ? "source" : "sources"}`;
  const pushed = f.news && f.newsPeople ? "big ones and new work pushed" : f.news ? "big ones pushed" : f.newsPeople ? "new work pushed" : "nothing pushed";
  return `${sources} · ${pushed}`;
}

/** The kinds of line a card or a list entry can ask the facts for. */
export type LineKind = "theme" | "screensaver" | "services" | "region" | "notifications" | "appearance" | "news";

export function lineFor(kind: LineKind, f: SettingFacts) {
  switch (kind) {
    case "theme":
      return themeLine(f);
    case "screensaver":
      return screensaverLine(f.screensaver);
    case "services":
      return servicesLine(f.services);
    case "region":
      return regionLine(f);
    case "notifications":
      return notificationsLine(f);
    case "appearance":
      return appearanceLine(f);
    case "news":
      return newsLine(f);
  }
}
