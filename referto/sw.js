// Service worker: l'app funziona anche senza connessione in spiaggia
const CACHE = 'bv-scoresheet-v7';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/i18n.js', 'js/rules.js', 'js/pdf.js', 'js/app.js', 'js/cloud.js', '../js/firebase-config.js', 'img/icon.svg',
  'vendor/jspdf.umd.min.js', 'vendor/jszip.min.js', 'fonts/Roboto-Regular.ttf', 'fonts/Roboto-Bold.ttf',
  '../vendor/firebase/firebase-app.js', '../vendor/firebase/firebase-auth.js', '../vendor/firebase/firebase-firestore.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rete prima (per ricevere gli aggiornamenti), cache se offline.
// Solo file dell'app (librerie Firebase comprese, ora dentro l'app): le connessioni al database passano senza intermediari.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || Response.error()))
  );
});
