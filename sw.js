const CACHE = 'tysklandsstien-v16';
const CORE_ASSETS = [
  './', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png',
  './celebrate.mp4', './ohno.mp4',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// <video> asks for byte ranges, and Safari refuses to play a cached video
// unless the service worker answers those with a proper 206 response.
async function rangeResponse(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request.url);
  if (!cached) return fetch(request);

  const buf = await cached.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  let start = 0;
  let end = buf.byteLength - 1;
  if (m) {
    if (m[1] !== '') {
      start = parseInt(m[1], 10);
      if (m[2] !== '') end = Math.min(parseInt(m[2], 10), end);
    } else if (m[2] !== '') {
      start = Math.max(0, buf.byteLength - parseInt(m[2], 10));
    }
  }
  const slice = buf.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(slice.byteLength),
    },
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.headers.has('range')) {
    event.respondWith(rangeResponse(event.request));
    return;
  }

  const isNavigation = event.request.mode === 'navigate'
    || (event.request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Network-first for the page itself, so a fresh deploy always shows up
    // immediately when online; only fall back to the cache when offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (images, icons, manifest) — they change
  // rarely, so serving instantly and updating in the background is fine.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
