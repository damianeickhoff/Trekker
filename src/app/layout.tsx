import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cache } from "react";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";
import { currentSeason } from "@/lib/current-season";
import { db } from "@/lib/db";
import { getNotifications } from "@/lib/notification-centre";
import { Nav } from "@/components/nav";
import { OriginProvider } from "@/components/origin";
import { SeasonDecor } from "@/components/season-decor";
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
        select: { theme: true, themeResolved: true, accent: true },
      })
    : null;

  return {
    theme: (account?.theme ?? "system") as Theme,
    resolved: account?.themeResolved === "light" ? ("light" as const) : ("dark" as const),
    // Violet is the ramp's own colour, so it needs no attribute at all.
    accent: account?.accent && account.accent !== "violet" ? account.accent : undefined,
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
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const { theme, resolved, accent } = await chrome();

  const { setting: seasonSetting, season, canOverride } = await currentSeason();

  // The bell lives in the header, so this runs on every page. Three small
  // indexed reads, and nothing is fetched over the network for it.
  const notifications = user ? await getNotifications(user.id) : null;

  return (
    <html
      lang="en"
      data-theme={resolved}
      data-accent={accent}
      data-season={season ?? undefined}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeSync theme={theme} />
        <OriginProvider>
        <SeasonDecor season={season} />
        <Nav
          user={
            user ? { ...user, avatarUrl: avatarUrl(user) } : null
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
