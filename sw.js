const CACHE_NAME = 'libreta-v7';
const ML_CACHE = 'libreta-ml-v1'; // MediaPipe (código, wasm y modelo): se guarda la primera vez y funciona sin conexión
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './version.js',
  './rutina.js',
  './rutina-stats.js',
  './pushup.js',
  './sync.js',
  './config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png',
  './icons/apple-touch-icon.png'
];

const isML = (u) =>
  (u.hostname === 'cdn.jsdelivr.net' && u.pathname.startsWith('/npm/@mediapipe/')) ||
  (u.hostname === 'storage.googleapis.com' && u.pathname.startsWith('/mediapipe-models/'));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('libreta-') && k !== CACHE_NAME && k !== ML_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Primero la red (para recibir siempre la última versión) y la caché si no hay conexión.
// Google (inicio de sesión y Drive) y las fuentes externas nunca pasan por la caché.
// Excepción: los archivos de MediaPipe (versión fija) van primero a la caché libreta-ml-v1.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isML(url)) {
    event.respondWith(
      caches.open(ML_CACHE).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((response) => {
          if (response.ok || response.type === 'opaque') cache.put(req, response.clone());
          return response;
        }))
      )
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then((response) => {
      if (response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
      }
      return response;
    }).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
    )
  );
});
