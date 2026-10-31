// Офлайн-режим: журнал открывается и без интернета.
// Свои файлы: сначала сеть (чтобы обновления приходили сразу), без сети — из кэша.
// Шрифты и библиотека Excel: сначала кэш.
const CACHE = 'ibra-v2';
const SHELL = [
  "./",
  "index.html",
  "css/app.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "js/app.js",
  "js/catalog.js",
  "js/config.js",
  "js/db.js",
  "js/export.js",
  "js/stats.js",
  "js/store.js",
  "js/ui/backup.js",
  "js/ui/calendar.js",
  "js/ui/clients.js",
  "js/ui/more.js",
  "js/ui/sheet.js",
  "js/ui/shift-form.js",
  "js/ui/stats.js",
  "js/ui/today.js",
  "js/ui/visit-form.js",
  "js/util.js",
  "js/vendor/xlsx.full.min.js",
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheFirst = url.origin !== location.origin || url.pathname.includes('/vendor/');
  if (cacheFirst) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(
    withTimeout(fetch(req), 4000).then((res) => {
      // сайт недоступен или удалён (404/5xx): работать из кэша, журнал в телефоне не зависит от хостинга
      if (!res.ok) throw new Error('bad status ' + res.status);
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
