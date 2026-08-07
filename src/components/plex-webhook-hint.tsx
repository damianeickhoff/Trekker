"use client";

import { Check, Copy, Webhook } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The exact URL to paste into Plex, built from wherever this page is being
 * served — so it is right for a LAN address, a domain, or a reverse proxy
 * without anybody having to work it out.
 */
export function PlexWebhookHint({ configured }: { configured: boolean }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setOrigin(window.location.origin));
    return () => cancelAnimationFrame(frame);
  }, []);

  const url = `${origin}/api/plex/webhook?key=YOUR_SECRET`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (an insecure origin, usually). The URL is on screen
      // either way, so there is nothing to recover from.
    }
  }

  return (
    <div className="mt-4 border-t border-ink-800 pt-4">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-ink-300 uppercase">
        <Webhook size={14} />
        Instant logging
      </p>

      {configured ? (
        <>
          <p className="mt-2 text-xs text-ink-400">
            In Plex: <span className="text-ink-200">Settings → Webhooks → Add Webhook</span>, and
            paste this, replacing <code className="text-ink-300">YOUR_SECRET</code> with the value
            of <code className="text-ink-300">PLEX_WEBHOOK_SECRET</code>. Needs a Plex Pass.
          </p>

          <p className="mt-1 text-xs text-ink-500">
            The secret must be URL-safe — letters, digits, <code className="text-ink-400">-</code>{" "}
            and <code className="text-ink-400">_</code>. A <code className="text-ink-400">&amp;</code>{" "}
            or <code className="text-ink-400">#</code> in it gets cut off on the way here and Plex
            just sees a 401.
          </p>

          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-ink-700 bg-ink-900/70 px-3 py-2 text-xs text-ink-300">
              {origin ? url : "…"}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-2 text-xs text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              {copied ? <Check size={13} className="text-fresh-500" /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-ink-400">
          Set <code className="text-ink-300">PLEX_WEBHOOK_SECRET</code> in the environment and
          restart to have Plex tell Trekker the moment something is watched. Without it, anything
          you watch with a Trekker tab open is still logged once it passes 90%.
        </p>
      )}
    </div>
  );
}
