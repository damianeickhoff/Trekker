import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline — Trekker" };

/**
 * What the installed app shows when a navigation cannot reach the server.
 *
 * Precached by the service worker, so it has to be a *static* page — no session
 * read, no database, nothing that needs the network it is standing in for.
 * That is also why it says nothing about your library: anything it claimed
 * would be a guess, and a wrong count is worse than no count.
 */
export default function OfflinePage() {
  return (
    <div className="rise grid place-items-center py-24 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl border border-ink-700 bg-ink-800/50 text-ink-400">
        <WifiOff size={26} />
      </span>

      <h1 className="mt-5 text-xl font-semibold tracking-tight">No connection</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-400">
        Trekker keeps everything on your own server, so it needs to reach it to show you
        anything. Nothing has been lost — this page will work again the moment you are back.
      </p>

      {/*
        A real page load, not a router navigation — which is why this is an `<a>`
        and the lint rule is turned off for it rather than satisfied.
        `next/link` does a client-side transition served from the router cache,
        so on the one page whose entire purpose is "try the network again" it is
        the one thing that would not.
      */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-6 rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500"
      >
        Try again
      </a>
    </div>
  );
}
