// Service worker: il referto funziona anche senza connessione in palestra
const CACHE = 'mf-indoor-scoresheet-v4';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'js/rules.js', 'js/pdf.js', 'js/app.js', 'img/icon.svg',
  'vendor/jspdf.umd.min.js', 'fonts/Roboto-Regular.ttf', 'fonts/Roboto-Bold.ttf'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rete prima (per ricevere gli aggiornamenti), cache se offline. Solo i file dell'app.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || Response.error()))
  );
});
