import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist_Mono, Instrument_Sans } from "next/font/google";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import { BACKGROUND_COOKIE, parseBackground } from "@/lib/background";
import { BOOT_SCRIPT, SW_REGISTER_SCRIPT } from "@/lib/boot-script";
import { THEME_COOKIE, parseThemePreference, serverTheme } from "@/lib/theme";
import "./globals.css";

/*
 * Fonts are fetched once at build and served from this origin, so nothing
 * reaches Google at runtime. Display and body are preloaded because the first
 * paint uses both; mono only marks codes and counts and can arrive later.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  axes: ["opsz"],
});
const body = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Trekker", template: "%s · Trekker" },
  description: "A self-hosted tracker for what the household watches.",
  applicationName: "Trekker",
  appleWebApp: { capable: true, title: "Trekker", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/32", type: "image/png", sizes: "32x32" }],
    apple: [{ url: "/icons/180", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0C10",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

/**
 * The root layout reads the cookie jar and nothing else: no user row, no
 * notifications, no season. Everything below streams, so the first byte is
 * never waiting on the database.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = serverTheme(parseThemePreference(jar.get(THEME_COOKIE)?.value));
  // What stands behind the page, from its cookie like the theme (`lib/background.ts`); plain draws nothing.
  const background = parseBackground(jar.get(BACKGROUND_COOKIE)?.value);

  return (
    <html
      lang="en-GB"
      data-theme={theme}
      data-background={background.variant === "plain" ? undefined : background.variant}
      style={background.variant === "colour" ? ({ "--bg-hue": background.hue } as CSSProperties) : undefined}
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      // The boot script may correct data-theme and data-background and add
      // data-sidebar before hydration; that is the point of it, not a mismatch.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
        {process.env.NODE_ENV === "production" && (
          <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
