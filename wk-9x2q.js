// sw-share.js — Success To Follow For Ever
// Real installed Service Worker (required for a POST + files share_target;
// a Blob-URL script cannot be re-registered across launches — see the
// comment block in the HTML file right above navigator.serviceWorker.register).
//
// Job: when Android's Share Sheet sends "Share to Success To Follow For
// Ever", the OS does a POST (multipart/form-data) straight to this app's
// start_url. This worker intercepts that ONE request, reads the posted
// title/text/url/files out of the form data, saves them into the same
// 'ShareInboxDB' IndexedDB (store 'shares', keyPath 'id') that the HTML
// page's own getAllShareRecords()/processShareQueue() already read from,
// then redirects the browser to a normal GET load of the app. Every other
// request (normal page loads, all the CDN scripts, everything else) is
// left completely untouched — see the fetch-filter check below.

const SHARE_DB_NAME = 'ShareInboxDB';
const SHARE_DB_STORE = 'shares';
const SHARE_DB_VERSION = 1;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function openShareDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHARE_DB_STORE)) {
        req.result.createObjectStore(SHARE_DB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function putShareRecord(record) {
  return openShareDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_DB_STORE, 'readwrite');
    tx.objectStore(SHARE_DB_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// 🐛 Fix (Aug 2026 — "Extract from WhatsApp Upload செய்யும்பொழுது பாப்அப்
// ஸ்க்ரீன் வருவதில்லை" still happening after the pageshow/visibilitychange
// fix). The HTML page listens for navigator.serviceWorker 'message' events
// with type 'stffe-share-received' as its most reliable popup trigger
// (works even when Android brings an already-open app window to the
// foreground without firing pageshow/visibilitychange at all) — but this
// file never actually sent that message, so that path silently never
// fired. Broadcasts to every open client window/tab of this app.
function broadcastToClients(data) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage(Object.assign({ type: 'stffe-share-received' }, data)));
  }).catch(() => {});
}

// Only ever intercepts a POST to THIS app's own URL (the share_target
// "action") — a plain GET page load, every CDN script fetch, and any other
// network request all fall straight through untouched via the early
// return below.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'POST') return;

  const url = new URL(req.url);
  // share_target.action is "./<this html file>" — match on pathname so
  // this keeps working across every version-numbered rename of the HTML.
  if (!url.pathname.toLowerCase().endsWith('.html')) return;

  // 🐛 ROOT-CAUSE FIX (Aug 2026 — "Extract popup-க்கு முன்னாடி Screen
  // Hang ஆகி Scroll கூட முடியல, 2 நிமிடம் கழிச்சு தான் Popup வருது",
  // reported specifically for a big WhatsApp Chat-Export .zip share).
  // Every earlier fix here assumed the browser could only navigate to
  // the NEW page AFTER this whole async function — file parsing +
  // IndexedDB storage — finished. For a large chat-export zip
  // (hundreds of photos/videos), reading the POSTed multipart body
  // into File objects and writing that into IndexedDB genuinely can
  // take a minute or more on this phone. Since `event.respondWith()`
  // was only called once ALL of that was done, the browser had
  // nothing to navigate to yet — so it just kept showing the OLD
  // already-loaded page (frozen-looking, no scroll) for that whole
  // stretch, and the popup only ever appeared once the redirect
  // FINALLY fired at the very end.
  //
  // Fix: split the work in two, and don't make one wait for the
  // other —
  //   1) `redirectPromise` below only needs a fast manifest.json
  //      fetch (no file data at all) and is handed to
  //      event.respondWith() immediately, so the browser can
  //      navigate to the current app page right away — the person
  //      sees/can-use the live app within a second or two instead of
  //      a frozen old screen.
  //   2) The actual heavy work — reading the files out of the
  //      POSTed form and storing them into ShareInboxDB — runs
  //      separately in `storePromise`, handed to `event.waitUntil()`
  //      so the Service Worker is kept alive to finish it in the
  //      background AFTER the redirect/navigation has already
  //      happened. The existing postMessage('stffe-share-received')
  //      broadcast (unchanged below) still fires 'fetch-intercepted'
  //      immediately and 'save-finished' once storage actually
  //      completes — the already-loaded new page's own listener (see
  //      the HTML's navigator.serviceWorker 'message' handler) picks
  //      that up and shows the Extract popup at that point, same as
  //      before. Net effect: the app becomes usable again almost
  //      instantly, and the popup still shows itself the moment the
  //      share is actually ready — no more multi-minute blank freeze
  //      in between.
  // Only storePromise below ever reads the request body (via
  // req.formData()) — redirectPromise further down never touches it,
  // so no req.clone() is needed here.
  const storePromise = (async () => {
    await broadcastToClients({ stage: 'fetch-intercepted' });
    try {
      const formData = await req.formData();
      const title = formData.get('title') || '';
      const text = formData.get('text') || '';
      const shareUrl = formData.get('url') || '';
      const fileEntries = formData.getAll('files').filter((f) => f && typeof f === 'object' && 'name' in f);

      const files = await Promise.all(fileEntries.map(async (f) => ({
        name: f.name || 'shared-file',
        type: f.type || '',
        blob: f // File is itself a Blob; stored as-is in IndexedDB.
      })));

      const id = 'SHARE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      await putShareRecord({ id, title, text, url: shareUrl, files, time: Date.now() });
      await broadcastToClients({ stage: 'save-finished', ok: true });
    } catch (err) {
      // Never block anything just because parsing/storage hiccuped —
      // the page's own processShareQueue() will simply find nothing
      // new this time; better than leaving the user stuck with no
      // explanation at all.
      console.warn('sw-share.js: failed to store incoming share', err);
      await broadcastToClients({ stage: 'save-finished', ok: false, error: String((err && err.message) || err) });
    }
  })();
  event.waitUntil(storePromise);

  // 🐛 EARLIER FIX (kept as-is, Aug 2026 — "Extract from WhatsApp
  // Upload செய்யும்பொழுது பாப்அப் ஸ்க்ரீன் வருவதில்லை"): redirect to
  // manifest.json's own start_url (fetched fresh, no-store) instead of
  // the exact filename the Share Sheet posted to — that posted-to
  // filename is baked into the Home Screen shortcut/WebAPK at install
  // time and 404s the moment the HTML is renamed for a newer version.
  // Falls back to the old posted-to filename only if manifest.json
  // itself can't be fetched (e.g. fully offline).
  const redirectPromise = (async () => {
    let redirectTarget = url.pathname + url.search;
    try {
      const manifestResp = await fetch(new URL('./cfg-9x2q.json', url).href, { cache: 'no-store' });
      if (manifestResp.ok) {
        const manifest = await manifestResp.json();
        if (manifest && manifest.start_url) {
          const target = new URL(manifest.start_url, url);
          target.searchParams.set('shared', '1');
          redirectTarget = target.pathname + target.search;
        }
      }
    } catch (e) {
      console.warn('sw-share.js: manifest.json lookup failed, falling back to posted-to URL', e);
    }
    return Response.redirect(redirectTarget, 303);
  })();
  event.respondWith(redirectPromise);
});
