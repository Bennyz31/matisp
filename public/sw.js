/**
 * Service worker minimal : l'appli doit s'ouvrir sans réseau.
 * Les pages sont servies depuis le cache en repli, jamais les appels API —
 * ceux-ci échouent proprement et la saisie continue en local.
 */
const CACHE = "matisp-v1";
const SOCLE = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SOCLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  e.respondWith(
    fetch(e.request)
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copie)).catch(() => {});
        return reponse;
      })
      .catch(async () => (await caches.match(e.request)) || (await caches.match("/")) || Response.error()),
  );
});
