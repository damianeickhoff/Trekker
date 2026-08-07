"use client";

import { useRef } from "react";

/**
 * Opens something in the Plex app where there is one, and in the browser where
 * there is not.
 *
 * `app.plex.tv` links are handled by the mobile apps only when the OS has the
 * universal link registered, which it often has not — so a tap lands in a
 * browser tab instead of the app people actually watch in. This tries the
 * `plex://` scheme first and falls back to the web player if nothing takes it,
 * which is the only way to tell: a scheme that no app claims fails silently.
 */
export function PlexOpen({
  appHref,
  webHref,
  className,
  title,
  children,
}: {
  appHref: string | null;
  webHref: string;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function open(event: React.MouseEvent) {
    if (!appHref) return; // Let the anchor do its normal thing.
    event.preventDefault();

    // If the app takes over, the page is backgrounded and the fallback is
    // cancelled. If nothing happens, we are still here a moment later.
    const cancel = () => {
      if (document.visibilityState === "hidden" && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };

    document.addEventListener("visibilitychange", cancel, { once: true });

    timer.current = setTimeout(() => {
      document.removeEventListener("visibilitychange", cancel);
      window.open(webHref, "_blank", "noreferrer");
    }, 1200);

    window.location.href = appHref;
  }

  return (
    <a
      href={webHref}
      onClick={open}
      target="_blank"
      rel="noreferrer"
      title={title}
      className={className}
    >
      {children}
    </a>
  );
}
