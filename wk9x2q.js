/* STFFE Service Worker (plain) - no caching, no storage, no request handling. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.filter(function (k) { return k.indexOf('stffe-cfg') === 0; }).map(function (k) { return caches.delete(k); }));
    } catch (x) {}
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', function () {});
