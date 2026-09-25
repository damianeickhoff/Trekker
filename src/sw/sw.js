/*
 * Trekker's service worker. `scripts/build-sw.mjs` copies this to
 * `public/sw.js` with the version stamped in, once per build.
 *
 * The whole point is the next launch: the installed app should paint its shell
 * from cache in a couple of hundred milliseconds, then let the page fetch its
 * data, rather than wait on a server render before showing anything.
 *
 * - Navigations: shell first. A cached copy of the page is answered at once and
 *   refreshed in the background for next time. Pages never seen are fetched.
 * - `/_next/static/*`: cache first. Every file there is content-hashed.
 * - TMDB images: cache first, capped, so rails do not re-download on launch.
 * - Everything else, including RSC requests and server actions, is untouched.
 *   Offline writes are out of scope; an outbox would need reconciling against
 *   the duplicate-play windows.
 */

const VERSION = "__SW_VERSION__";
const PAGES = `trekker-pages-${VERSION}`;
const STATIC = `trekker-static-${VERSION}`;
// Not versioned: a TMDB image URL names one image forever, across deploys.
const IMAGES = "trekker-images";

const IMAGE_LIMIT = 300;
const PAGE_LIMIT = 60;

/** What the shell is made of. The chunks and fonts are read out of these pages. */
const SHELL_PAGES = ["/", "/login"];
const SHELL_ASSETS = ["/manifest.webmanifest", "/icons/32", "/icons/180", "/icons/192", "/icons/512"];

const origin = self.location.origin;
const abs = (path) => new URL(path, origin).href;

/** Every `/_next/static/` path a page or stylesheet mentions, resolved to this origin. */
function staticRefs(text, base) {
  const found = new Set();
  for (const m of text.matchAll(/\/_next\/static\/[^"'()\s\\]+/g)) found.add(abs(m[0]));
  // Stylesheets may point at fonts relatively, e.g. url(../media/x.woff2).
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === origin && u.pathname.startsWith("/_next/static/")) found.add(u.href);
    } catch {
      // Not a URL (a data: URI fragment or similar); nothing to cache.
    }
  }
  return found;
}

async function put(cache, url) {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (res.ok) await cache.put(url, res);
  } catch {
    // Precaching is best effort: a missing asset is fetched when first used.
  }
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      const statics = await caches.open(STATIC);
      const assets = new Set(SHELL_ASSETS.map(abs));

      for (const path of SHELL_PAGES) {
        try {
          const res = await fetch(path, { credentials: "same-origin" });
          if (!res.ok) continue;
          for (const u of staticRefs(await res.clone().text(), res.url)) assets.add(u);
          // Signed out, "/" redirects to sign-in; a redirect is not Home's shell.
          if (!res.redirected) await pages.put(abs(path), res);
        } catch {
          // Offline during install: the pages are cached on first visit instead.
        }
      }

      // Stylesheets name the font files, including the mono face that is not
      // preloaded and so never appears in the HTML.
      for (const u of [...assets].filter((u) => new URL(u).pathname.endsWith(".css"))) {
        try {
          const res = await fetch(u);
          if (!res.ok) continue;
          for (const f of staticRefs(await res.clone().text(), u)) assets.add(f);
          await statics.put(u, res);
        } catch {
          // As above: best effort.
        }
      }

      const rest = [...assets].filter((u) => !new URL(u).pathname.endsWith(".css"));
      await Promise.all(rest.map((u) => put(statics, u)));

      // Take over at once. A tab still open on the previous build may ask for a
      // chunk that has just been dropped; Next answers a failed chunk load with
      // a full reload, which lands on this build's shell.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC, IMAGES]);
      for (const name of await caches.keys()) {
        if (name.startsWith("trekker-") && !keep.has(name)) await caches.delete(name);
      }
      // The background refresh of a cached page rides on the preload request,
      // so it starts while the worker is still waking.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

/**
 * Home's shell, fetched if it is not cached yet. Install usually happens on
 * the sign-in page, where "/" still redirects, and signing in moves to Home
 * without a full navigation, so without this the first shell-first launch
 * would be the second one after signing in.
 */
async function warmHome() {
  const key = abs("/");
  if (await caches.match(key, { cacheName: PAGES })) return;
  try {
    const res = await fetch(key, { credentials: "same-origin" });
    if (res.ok && !res.redirected && isHtml(res)) await (await caches.open(PAGES)).put(key, res);
  } catch {
    // Offline; the next visit to Home caches it instead.
  }
}

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  // Sent on sign out, so the next person to open the app does not see the
  // previous person's pages painted from cache.
  if (type === "clear-pages") event.waitUntil(caches.delete(PAGES));
  // Sent by every signed-in page once it has loaded.
  if (type === "warm-home") event.waitUntil(warmHome());
});

function isHtml(res) {
  return (res.headers.get("content-type") || "").includes("text/html");
}

function pageKey(url) {
  return url.origin + url.pathname + url.search;
}

/**
 * The server's fresh answer to a page we already painted from cache. Stored
 * for next time, and the tab is told, so it can fetch today's data for the
 * page it is showing rather than leave the painted copy on screen: that copy
 * is the shell, not the answer.
 */
async function refreshPage(res, key, clientId) {
  const pages = await caches.open(PAGES);

  if (res.ok && res.type === "basic" && !res.redirected && isHtml(res)) {
    await pages.put(key, res);
    await trim(PAGES, PAGE_LIMIT);
    const client = clientId && (await self.clients.get(clientId));
    if (client) client.postMessage({ type: "page-fresh" });
    return;
  }

  // A 5xx is the server having a bad moment; the cached page is still right.
  if (res.status >= 500) return;

  // Anything else (a redirect to sign-in, a 404) means the cached page no
  // longer exists as it was. Forget it and have the tab reload from network.
  await pages.delete(key);
  const client = clientId && (await self.clients.get(clientId));
  if (client) client.postMessage({ type: "stale-page" });
}

async function navigate(event) {
  const url = new URL(event.request.url);
  const key = pageKey(url);
  const cached = await caches.match(key, { cacheName: PAGES });

  const network = (async () => (await event.preloadResponse) || fetch(event.request))();

  if (cached) {
    event.waitUntil(
      network.then((res) => refreshPage(res, key, event.resultingClientId || event.clientId)).catch(() => {}),
    );
    return cached;
  }

  try {
    const res = await network;
    if (res.ok && res.type === "basic" && !res.redirected && isHtml(res)) {
      const copy = res.clone();
      event.waitUntil(
        caches
          .open(PAGES)
          .then((c) => c.put(key, copy))
          .then(() => trim(PAGES, PAGE_LIMIT)),
      );
    }
    return res;
  } catch {
    return offline();
  }
}

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request, { cacheName });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(request, copy));
  }
  return res;
}

function isTmdbImage(url) {
  if (url.hostname === "image.tmdb.org") return true;
  return (
    url.origin === origin &&
    url.pathname === "/_next/image" &&
    (url.searchParams.get("url") || "").startsWith("https://image.tmdb.org/")
  );
}

async function image(event) {
  const request = event.request;
  const hit = await caches.match(request.url, { cacheName: IMAGES });
  if (hit) return hit;

  // An <img> asks without CORS, and an opaque answer is padded to megabytes of
  // quota per entry. Asking TMDB with CORS gets a real response worth keeping.
  const sameOrigin = new URL(request.url).origin === origin;
  let res = null;
  try {
    res = await fetch(sameOrigin ? request : new Request(request.url, { mode: "cors", credentials: "omit" }));
  } catch {
    res = null;
  }

  if (res && res.ok) {
    const copy = res.clone();
    event.waitUntil(
      caches
        .open(IMAGES)
        .then((c) => c.put(request.url, copy))
        .then(() => trim(IMAGES, IMAGE_LIMIT)),
    );
    return res;
  }
  return fetch(request);
}

function offline() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:0 24px;text-align:center;background:#0B0C10;color:#fff;font:15px system-ui,sans-serif">You are offline. Trekker opens again when the connection is back.</body>',
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Route handlers a navigation passes through (the Plex sign-in's legs) and
  // the Plex Home picker, whose faces belong to one sign-in, are never pages
  // to keep: the network answers them, untouched.
  if (request.mode === "navigate" && (url.pathname.startsWith("/api/") || url.pathname === "/login/profile")) return;

  if (request.mode === "navigate" && url.origin === origin) {
    event.respondWith(navigate(event));
  } else if (url.origin === origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (url.origin === origin && SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (isTmdbImage(url)) {
    event.respondWith(image(event));
  }
});

/*
 * Push: the morning message and a friend request, in the bell's own words.
 * A tap reuses an open Trekker window where there is one, rather than leaving
 * a trail of them.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Trekker", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Trekker", {
      body: data.body || "",
      tag: data.tag || "trekker",
      icon: "/icons/192",
      badge: "/icons/192",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(origin) && "focus" in client) {
          return client.navigate(target).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
