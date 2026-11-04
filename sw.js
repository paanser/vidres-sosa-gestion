"use strict";
const RELEASE = "__BUILD_VERSION__";
const VERSION = RELEASE.startsWith("__") ? "local" : RELEASE;
const PREFIX = "vidres-sosa:" + self.registration.scope + ":",
  CACHE = PREFIX + VERSION;
const ASSETS = [
  "./",
  "index.html",
  "version.json",
  "loader.js",
  "styles.css",
  "utils.js",
  "ui.js",
  "icons.js",
  "storage.js",
  "calculations.js",
  "migrate.js",
  "files.js",
  "backup.js",
  "tariffs.js",
  "tools.js",
  "quotes.js",
  "sketch.js",
  "job-measures.js",
  "app.js",
  "ai-config.js",
  "voice.js",
  "enhancements.js",
  "expediente.js",
  "pwa.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/logo.png",
  "fonts/inter-var-latin.woff2",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(
        ASSETS.map(
          (name) =>
            new Request(new URL(name, self.registration.scope), {
              cache: "reload",
            }),
        ),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const req = event.request,
    url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.href.startsWith(self.registration.scope) ||
    url.pathname.includes("/api/")
  )
    return;
  const name = url.pathname.slice(
    new URL(self.registration.scope).pathname.length,
  );
  if (!ASSETS.includes(name || "./") && req.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE),
        v = url.searchParams.get("v");
      if (v && v !== VERSION)
        return fetch(new Request(req, { cache: "no-cache" }));
      if (v) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        return fetch(req);
      }
      try {
        const response = await fetch(new Request(req, { cache: "no-cache" }));
        if (response.ok) return response;
        throw Error("Servidor no disponible");
      } catch {
        const hit =
          (await cache.match(req, { ignoreSearch: true })) ||
          (req.mode === "navigate"
            ? await cache.match(new URL("index.html", self.registration.scope))
            : null);
        return (
          hit ||
          new Response(
            "Sin conexión. Abre la aplicación una vez con internet.",
            {
              status: 503,
              headers: { "Content-Type": "text/plain;charset=utf-8" },
            },
          )
        );
      }
    })(),
  );
});
