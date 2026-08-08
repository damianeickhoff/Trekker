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

const VERSION = "v1";
const STATIC = `trekker-static-${VERSION}`;
const SHELL = `trekker-shell-${VERSION}`;

/** Answered from the cache when a navigation cannot reach the network. */
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon.svg"]))
      // A failed precache must not stop the worker installing — push
      // notifications are the part that matters most and they need no cache.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
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
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((hit) => hit ?? Response.error()),
      ),
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
