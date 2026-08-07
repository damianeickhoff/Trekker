/**
 * Trekker's service worker. It exists only to receive push messages — there is
 * no offline caching here, because a watch tracker with stale data is worse
 * than one that says it cannot reach the server.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
