"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on every load, rather than only when somebody
 * turns push notifications on.
 *
 * That was the old arrangement, and it meant the worker's offline handling
 * never existed for anyone who had not opted into notifications — including
 * people who had installed the app to their home screen, which is precisely
 * where opening it without a connection happens.
 *
 * Registration is idempotent, so the notifications panel can carry on calling
 * `register` for its own purposes; the browser hands back the same worker.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // After load rather than during it: registration competes with the first
    // paint for the same main thread, and nothing here is needed to render.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Refused by the browser, an insecure origin, or private browsing.
        // Everything the app does still works; only the offline fallback and
        // push are lost, and neither is worth an error in the console.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
