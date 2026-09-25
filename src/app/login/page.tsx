import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { Poster } from "@/components/poster";
import { Wordmark } from "@/components/ui";
import { loginPosters } from "@/lib/login-wall";

export const metadata: Metadata = { title: "Sign in" };

/*
 * The poster wall from the mockup: this week's trending posters from the TMDB
 * cache when it holds any (`lib/login-wall.ts`, never the network), else
 * shaded tiles that keep the composition without inventing posters.
 */
const TILE_SHADES = ["#22242C", "#2A2C35", "#1C1D24", "#30323C", "#262831", "#1F2129"];

function PosterWall({ posters }: { posters: string[] }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="absolute -inset-10 grid rotate-[-6deg] scale-[1.15] grid-cols-4 gap-2 opacity-50 lg:grid-cols-8"
      >
        {Array.from({ length: 32 }, (_, i) =>
          posters[i] ? (
            <Poster
              key={i}
              path={posters[i]}
              alt=""
              width={160}
              height={240}
              sizes="(min-width: 64rem) 160px, 90px"
              className="h-[135px] w-full rounded-[10px] lg:h-[240px]"
            />
          ) : (
            <span
              key={i}
              className="block h-[135px] rounded-[10px] lg:h-[240px]"
              style={{ background: TILE_SHADES[(i * 5 + Math.floor(i / 8)) % TILE_SHADES.length] }}
            />
          ),
        )}
      </div>
      {/* Fades the wall into the page so the form below reads as one surface. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.7)_55%,var(--bg)_100%)]"
      />
    </>
  );
}

/**
 * Deliberately no session check here: the proxy only verifies signatures, so a
 * revoked token would bounce between here and Home. Showing the form to
 * someone already signed in costs nothing.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ plex?: string }> }) {
  const [posters, { plex }] = await Promise.all([loginPosters().catch(() => []), searchParams]);
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="relative h-[380px] shrink-0 overflow-hidden bg-night lg:h-auto lg:min-h-dvh lg:grow">
        <PosterWall posters={posters} />
        <div className="absolute inset-x-5 bottom-[22px] flex flex-col gap-2.5 text-white lg:bottom-16 lg:left-16 lg:right-auto lg:max-w-[520px] lg:gap-3.5">
          <span className="lg:hidden">
            <Wordmark size={34} />
          </span>
          <span className="hidden lg:inline">
            <Wordmark size={44} />
          </span>
          <p className="m-0 font-display text-[22px] font-bold leading-[1.1] tracking-[-0.03em] text-white/90 lg:text-[34px] lg:leading-[1.05] lg:text-white/92">
            Everything you watch, in one place.
          </p>
          <p className="m-0 hidden text-[15px] text-white/70 lg:block">
            A self-hosted tracker for the household. Your history stays on your server.
          </p>
        </div>
      </div>

      <main className="px-5 pb-10 pt-2 lg:flex lg:w-[480px] lg:shrink-0 lg:flex-col lg:justify-center lg:gap-7 lg:px-14 lg:py-16">
        <h1 className="m-0 hidden font-display text-[30px] font-bold leading-[1.05] tracking-[-0.025em] lg:block">
          Welcome back
        </h1>
        {/* What went wrong on the way back from Plex, in its own words. */}
        <LoginForm plexProblem={typeof plex === "string" ? plex.slice(0, 200) : null} />
      </main>
    </div>
  );
}
