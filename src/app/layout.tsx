import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cache } from "react";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";
import { currentSeason } from "@/lib/current-season";
import { db } from "@/lib/db";
import { getNotifications } from "@/lib/notification-centre";
import { displayEmail } from "@/lib/plex-seat";
import { Nav } from "@/components/nav";
import { AchievementToaster } from "@/components/achievement-toaster";
import { OriginProvider } from "@/components/origin";
import { ScreensaverIdle } from "@/components/screensaver-idle";
import { SeasonDecor } from "@/components/season-decor";
import { ServiceWorkerRegistration } from "@/components/service-worker";
import { ThemeSync, type Theme } from "@/components/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Read from the account rather than from the browser, so the right theme is in
 * the very first byte and a hard reload cannot land on the wrong one. Memoised
 * because both `generateMetadata` and the layout itself need it, and it is one
 * indexed read either way.
 */
const chrome = cache(async () => {
  const user = await getCurrentUser();

  const account = user
    ? await db.user.findUnique({
        where: { id: user.id },
        select: {
          theme: true,
          themeResolved: true,
          accent: true,
          // Read here rather than in a query of its own: the layout already
          // fetches this row on every page, and the idle watcher needs one
          // number off it.
          screensaverIdle: true,
        },
      })
    : null;

  return {
    theme: (account?.theme ?? "system") as Theme,
    resolved: account?.themeResolved === "light" ? ("light" as const) : ("dark" as const),
    // Violet is the ramp's own colour, so it needs no attribute at all.
    accent: account?.accent && account.accent !== "violet" ? account.accent : undefined,
    screensaverIdle: account?.screensaverIdle ?? 0,
  };
});

export async function generateMetadata(): Promise<Metadata> {
  const { resolved } = await chrome();

  return {
    title: "Trekker — track what you watch",
    description:
      "Track the movies and episodes you watch, discover what's popular, and see where your hours went.",
    appleWebApp: {
      capable: true,
      title: "Trekker",
      /**
       * `viewport-fit: cover` alone does not get the installed app under the
       * status bar on iOS — this does. Left unset, iOS paints its own opaque
       * light status bar above the web view, which is a white strip over the
       * header that reads as the page having opened part-scrolled.
       *
       * Only in dark mode, though: `black-translucent` forces the clock and
       * battery to white whatever is behind them, and white on the pale light
       * header would be unreadable. Light mode keeps the opaque bar, where it
       * sits near enough to the header's own colour not to look like a seam.
       */
      statusBarStyle: resolved === "light" ? "default" : "black-translucent",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#07070c",
  // The installed app draws under the status bar / home indicator.
  viewportFit: "cover",
  /**
   * The app never scales. Two separate things were making it: iOS zooms in on a
   * focused field whose text is under 16px — handled in the stylesheet — and it
   * zooms on a double tap, which only this can stop. Pinning the scale closes
   * both, and matters most in the installed app, where there is no address bar
   * to show you that you are zoomed and no way to pinch back out to a known
   * good size.
   *
   * The cost is real: pinch-to-zoom goes with it. Text is sized in rem
   * throughout, so the system text-size setting still reaches everything.
   */
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const { theme, resolved, accent, screensaverIdle } = await chrome();

  const { setting: seasonSetting, season, canOverride } = await currentSeason();

  // The bell lives in the header, so this runs on every page. Three small
  // indexed reads, and nothing is fetched over the network for it.
  const notifications = user ? await getNotifications(user.id) : null;

  // When the newest badge was earned, taken from the notifications the bell has
  // already been given rather than from a query of its own.
  //
  // This is what makes the celebration land at the same moment the bell does.
  // The toaster cannot poll its way to "immediately", and it cannot watch the
  // route either, because the usual way to earn a badge — ticking an episode —
  // re-renders this layout without changing the URL. A value that moves when a
  // badge is earned is something it *can* watch.
  const newestBadgeAt = Math.max(
    0,
    ...(notifications?.items ?? [])
      .filter((item) => item.kind === "achievement")
      .map((item) => item.at.getTime()),
  );

  return (
    <html
      lang="en"
      data-theme={resolved}
      data-accent={accent}
      data-season={season ?? undefined}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/*
        `min-h-dvh` rather than `min-h-full`.

        `min-height: 100%` only means "a screenful" if <html>'s own height
        resolves to one, which makes the whole page depend on a chain — and on
        mobile, where the visible viewport shrinks and grows with the browser's
        own chrome, that chain is exactly where a short page ends up shorter
        than the screen. `dvh` is the visible viewport measured directly, so a
        page with two lines on it still fills the window and nothing below the
        content sits higher than the bottom of the screen.
      */}
      <body className="flex min-h-dvh flex-col">
        <ThemeSync theme={theme} />
        <ServiceWorkerRegistration />
        <OriginProvider>
        {/* Watches for the app being left alone. Listens to nothing at all
            until somebody has asked it to — see the component. */}
        {user && <ScreensaverIdle minutes={screensaverIdle} />}
        <SeasonDecor season={season} />

        {/* Over whatever page you happen to be on: earning a badge is rarely
            something you did on the page you are looking at. */}
        <AchievementToaster enabled={user !== null} signal={newestBadgeAt} />

        <Nav
          user={
            user
              ? {
                  ...user,
                  avatarUrl: avatarUrl(user),
                  // A managed Plex Home profile has no address of its own, and
                  // the one on the row is a placeholder minted to satisfy a
                  // unique index. Showing it would be showing them a lie.
                  email: displayEmail(user.email),
                  canSwitchProfile: Boolean(user.plexAccountId),
                }
              : null
          }
          season={season}
          seasonSetting={canOverride ? seasonSetting : null}
          notifications={notifications?.items ?? []}
        />
        <main className="mx-auto w-full max-w-6xl grow px-4 pt-5 pb-28 sm:px-6 md:pt-9 md:pb-16">
          {children}
        </main>
        </OriginProvider>
      </body>
    </html>
  );
}
