/* STFFE service worker — share target intake + offline fallback */
var CACHE = "stffe-sw-r2";
var DB = "ShareInboxDB", STORE = "shares";
var HOME = "./mgr-9x2q.html";

self.addEventListener("install", function () { self.skipWaiting(); });

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function openDb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open(DB, 1);
    r.onupgradeneeded = function () {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: "id" });
    };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error); };
  });
}

async function saveShare(request) {
  var fd = await request.formData();
  var files = [];
  var all = fd.getAll("files");
  for (var i = 0; i < all.length; i++) {
    var f = all[i];
    if (f && typeof f === "object" && "size" in f) {
      files.push({ name: f.name || ("shared-" + i), type: f.type || "", size: f.size, blob: f });
    }
  }
  var rec = {
    id: "sh_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    title: String(fd.get("title") || ""),
    text: String(fd.get("text") || ""),
    url: String(fd.get("url") || ""),
    files: files,
    ts: Date.now()
  };
  var db = await openDb();
  await new Promise(function (res, rej) {
    var tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = res;
    tx.onerror = function () { rej(tx.error); };
  });
  db.close();
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.method === "POST" && url.searchParams.get("share") === "1") {
    e.respondWith((async function () {
      try { await saveShare(req); } catch (err) {}
      return Response.redirect(HOME + "?shared=1", 303);
    })());
    return;
  }

  if (req.method !== "GET") return;

  e.respondWith(
    fetch(req).then(function (resp) {
      if (resp && resp.ok && resp.type === "basic") {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      }
      return resp;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true });
    })
  );
});
