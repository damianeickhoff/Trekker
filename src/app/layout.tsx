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

/**
 * The iPhones and iPads worth having a launch screen for, as
 * `[css width, css height, pixel ratio]`.
 *
 * iOS matches `apple-touch-startup-image` on the device's exact metrics, so
 * this is a list of devices rather than a set of breakpoints — a size it does
 * not recognise is ignored rather than scaled, and the app is back to launching
 * into a blank web view. Several rows cover more than one model: every phone
 * with the same panel takes the same entry.
 *
 * Anything not listed loses nothing it had before.
 */
const LAUNCH_SCREENS: [number, number, number][] = [
  [440, 956, 3], // 16 Pro Max
  [430, 932, 3], // 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max
  [402, 874, 3], // 16 Pro
  [393, 852, 3], // 16, 15, 15 Pro, 14 Pro
  [428, 926, 3], // 14 Plus, 13 Pro Max, 12 Pro Max
  [390, 844, 3], // 14, 13, 13 Pro, 12, 12 Pro
  [375, 812, 3], // 13 mini, 12 mini, 11 Pro, X, XS
  [414, 896, 3], // 11 Pro Max, XS Max
  [414, 896, 2], // 11, XR
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // SE (2nd/3rd), 8, 7
  [820, 1180, 2], // iPad Air
  [768, 1024, 2], // iPad, iPad mini
];

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
      /**
       * The launch screen. Android builds one from the manifest; iOS shows a
       * blank web view until first paint unless it is handed an image, which is
       * most of the pause between tapping the icon and seeing anything.
       *
       * Matched by exact device resolution, which is why there are this many
       * and why they cannot be one flexible image — a size iOS does not
       * recognise is simply ignored, and you are back to the blank. Both
       * orientations of each, since the app is portrait-locked but the launch
       * screen is not. See `app/splash/route.tsx` for what they draw.
       */
      startupImage: LAUNCH_SCREENS.flatMap(([width, height, scale]) => [
        {
          url: `/splash?w=${width * scale}&h=${height * scale}`,
          media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: portrait)`,
        },
        {
          url: `/splash?w=${height * scale}&h=${width * scale}`,
          media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${scale}) and (orientation: landscape)`,
        },
      ]),
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
