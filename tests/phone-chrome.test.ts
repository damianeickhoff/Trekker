import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The installed app on a phone: the status bar by theme, pages clear of it,
 * title artwork running up under the notch, the tab bar just above the home
 * indicator, and hero chips all one size.
 */

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const css = read("src/app/globals.css");

describe("the status bar", () => {
  it("is see-through in dark, so artwork can reach the notch, and ordinary in light", () => {
    expect(read("src/app/layout.tsx")).toContain('statusBarStyle: theme === "light" ? "default" : "black-translucent"');
  });

  it("is padded for on every page, and title heroes reach back up under it", () => {
    expect(css).toContain("--safe-top: env(safe-area-inset-top, 0px);");
    expect(read("src/app/(app)/layout.tsx")).toContain("pt-(--safe-top)");
    for (const file of ["film-page", "series-page", "episode-page"]) {
      expect(read(`src/components/title/${file}.tsx`), file).toContain("-mt-(--safe-top)");
    }
    expect(read("src/components/lists/smart-editor.tsx")).toContain("sticky top-(--safe-top)");
  });
});

describe("the tab bar", () => {
  it("floats a little above the home indicator rather than above the whole inset", () => {
    expect(css).toContain("--tab-float: max(18px, calc(env(safe-area-inset-bottom) - 12px));");
    expect(css).toContain("--tab-bar-clearance: calc(92px + var(--tab-float));");
    expect(read("src/components/tab-bar.tsx")).toContain("pb-(--tab-float)");
    expect(read("src/components/title/episode-page.tsx")).toContain("bottom-(--tab-float)");
  });
});

describe("hero chips", () => {
  it("draw amber and white at the see-through chips' size on film and series pages", () => {
    for (const file of ["film-page", "series-page"]) {
      const src = read(`src/components/title/${file}.tsx`);
      expect(src, file).not.toMatch(/<(StateChip|PlexChip|RequestedChip) small/);
    }
  });
});

describe("the top row on phones", () => {
  it("sits 27px down, clear of the blur iOS draws along the top edge", () => {
    const page = read("src/components/page.tsx");
    expect(page).toContain("flex h-[71px] shrink-0 items-center justify-between px-5 pt-[27px] lg:hidden");
    expect(page).toContain("flex h-[71px] items-center pt-[27px] lg:h-auto lg:pt-0");
    // The profile's rows show on desktop too, and keep their spacing there.
    expect(read("src/components/profile/hero.tsx")).toContain("lg:h-[60px] lg:pt-4");
  });

  it("stays pinned under the status bar on the pages with a hero, with a spacer holding its place", () => {
    for (const file of ["title/film-page", "title/series-page", "title/episode-page", "person-page"]) {
      const src = read(`src/components/${file}.tsx`);
      expect(src, file).toContain('<div aria-hidden="true" className="h-[71px] shrink-0" />');
      expect(src, file).toContain("pointer-events-none fixed inset-x-0 top-(--safe-top) z-(--z-top-row)");
      expect(src, file).toContain("*:pointer-events-auto lg:hidden");
    }
  });
});

describe("the phone's tabs", () => {
  it("carry News in Badges' place, and Badges moves to the account menu", async () => {
    const { PHONE_TABS, NAV, showsTabBar } = await import("@/components/nav");
    expect(PHONE_TABS.map((t) => t.href)).toEqual(["/", "/discover", "/calendar", "/lists", "/news"]);
    expect(NAV.map((t) => t.href)).toContain("/badges");
    expect(showsTabBar("/news")).toBe(true);
    expect(showsTabBar("/badges")).toBe(true);
    expect(read("src/components/tab-bar.tsx")).toContain("PHONE_TABS.map");
    expect(read("src/components/avatar-menu.tsx")).toContain('<Item href="/badges" icon="trophy" label="Badges" onPick={close} />');
  });

  it("draw News as a newspaper wherever it stands for News", () => {
    expect(read("src/components/nav.ts")).toContain('icon: "newspaper"');
    expect(read("src/components/settings/nav-items.ts")).toContain('icon: "newspaper"');
    expect(read("src/components/icon.tsx")).toContain("newspaper:");
  });
});

describe("Home's News rail", () => {
  it("fills with the latest headlines behind your own news, so it is there whenever there is news", () => {
    const tiers = read("src/components/home/tiers.tsx");
    expect(tiers).toContain("pressForReader(user.id, prefs.keepDays)");
    expect(tiers).toContain("if (rows.length === 0 && press.length === 0) return null;");
    expect(tiers).toContain('"latest headlines"');
    expect(tiers).toContain("<HomePressCard");
  });
});
