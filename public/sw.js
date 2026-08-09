/**
 * Trekker's service worker: push messages, and just enough caching that the
 * installed app opens without a connection.
 *
 * The caching is deliberately **read-only and shallow**. A watch tracker
 * showing yesterday's data as though it were today's is worse than one that
 * says it cannot reach the server, so nothing here serves a stale *page* while
 * the network is up. What it does is stop the installed app showing the
 * browser's dinosaur when there is no signal: the static build output is
 * cache-first because it is immutable and fingerprinted, and navigations fall
 * back to a cached shell only when the network has actually failed.
 *
 * Writes made offline are **not** queued, and that is a decision rather than an
 * omission: every write in this app goes through a React server action, not a
 * replayable request, so an outbox would need a second HTTP write path and its
 * own reconciliation against the duplicate-play windows in `lib/plays.ts`.
 * That is a feature, not a cache tweak.
 */

// Bumped when a precached asset changes, not only when this file's logic does:
// `/boot.html` and `/icon.svg` are cached at install, so an installed app goes
// on drawing the old mark until the cache is named something else.
const VERSION = "v3";
const STATIC = `trekker-static-${VERSION}`;
const SHELL = `trekker-shell-${VERSION}`;

/**
 * Answered from the cache when a navigation cannot reach the server.
 *
 * A plain static file rather than a rendered route. It used to be `/offline`,
 * which meant the fallback was a *Next page* — so it arrived wearing the header
 * and the tab bar, every link in them leading nowhere, and it could only ever be
 * as fresh as the last time the server had been up to render it. This one is
 * needed precisely when the thing that would render it is not there.
 *
 * It is also the answer to a wait, not only to a failure: the container applies
 * migrations before the server binds, so an update leaves several seconds where
 * the icon works and nothing is listening. The page shows the mark, keeps asking
 * `/api/health`, and reloads the moment it is answered — settling into the
 * offline copy only once asking has stopped being reasonable.
 */
const BOOT_URL = "/boot.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([BOOT_URL, "/icon.svg"]))
      // A failed precache must not stop the worker installing — push
      // notifications are the part that matters most and they need no cache.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  /**
   * Start the navigation request before this worker has finished booting.
   *
   * A service worker with a `fetch` handler is woken on every launch, and until
   * it is running the request it is going to make has not been made. On a cold
   * start that is dead time in front of every other kind of slow — the exact
   * shape of "the app takes a moment before anything appears". Navigation
   * preload takes the request off that critical path: the browser issues it in
   * parallel with the wake-up, and the handler below picks up the answer.
   */
  if (self.registration.navigationPreload) {
    event.waitUntil(self.registration.navigationPreload.enable().catch(() => undefined));
  }

  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          // Anything from an older VERSION is a cache of a build that no longer
          // exists. Leaving it would grow without limit.
          names
            .filter((name) => name.startsWith("trekker-") && !name.endsWith(VERSION))
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only GET, and only this origin. A POST is a server action; replaying one
  // from a cache would re-log a viewing.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /**
   * Build output is content-hashed, so a hit is always correct and a miss is
   * always worth caching. This is what makes the app *start* offline rather
   * than merely render a shell.
   */
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else stays network-first. Data is never served from a cache
  // while the network is reachable — only a failed navigation gets the shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // The preloaded response when there is one — see `activate`. It is
          // the same request, already in flight before this worker woke.
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;

          return await fetch(request);
        } catch {
          // Not reachable. That is either a server still coming up or a phone
          // with no signal, and the boot page is deliberately both: it cannot
          // tell them apart yet either, so it asks until one of them is true.
          const hit = await caches.match(BOOT_URL);
          return hit ?? Response.error();
        }
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Trekker", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Trekker";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || "trekker",
      // Same PNG route the installed app uses for its icon.
      icon: "/apple-icon",
      badge: "/apple-icon",
      data: { url: data.url || "/calendar" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  // Reuse an open tab where there is one, so tapping a reminder does not leave
  // a trail of duplicate windows.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
