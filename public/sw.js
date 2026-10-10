// Service Worker for RunaWeb - Afterplay-Style Offline Architecture

const CACHE_NAME = 'runaweb-shell-v3';
const GAME_CACHE_NAME = 'runaweb-virtual-game';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

let gameFiles = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Pre-cache core app shell assets
      try {
        await cache.addAll(APP_SHELL_ASSETS);
      } catch (err) {
        console.warn('Failed to pre-cache some app shell assets on install:', err);
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== GAME_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

async function saveGameAssetsToCache(files) {
  gameFiles.clear();
  const gameCache = await caches.open(GAME_CACHE_NAME);
  // Clear previous game cache
  const keys = await gameCache.keys();
  await Promise.all(keys.map((req) => gameCache.delete(req)));

  for (const path in files) {
    if (Object.prototype.hasOwnProperty.call(files, path)) {
      const normalizedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
      const fileData = files[path]; // Uint8Array or ArrayBuffer
      gameFiles.set(normalizedPath, fileData);

      const mimeType = getMimeType(normalizedPath);
      const response = new Response(fileData, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': fileData.byteLength.toString(),
          'Cache-Control': 'no-cache'
        }
      });

      // Construct virtual asset URL
      const virtualUrl = new URL(`virtual-game/${normalizedPath}`, self.location.origin + self.location.pathname).href;
      await gameCache.put(virtualUrl, response);
    }
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_GAME_FILES') {
    event.waitUntil(saveGameAssetsToCache(event.data.files));
  } else if (event.data && event.data.type === 'CLEAR_GAME_CACHE') {
    event.waitUntil(
      caches.delete(GAME_CACHE_NAME).then(() => {
        gameFiles.clear();
      })
    );
  }
});

const MIME_TYPES = {
  html: 'text/html',
  htm: 'text/html',
  js: 'text/javascript',
  mjs: 'text/javascript',
  css: 'text/css',
  wasm: 'application/wasm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  json: 'application/json',
  txt: 'text/plain',
  xml: 'application/xml',
  ttf: 'font/ttf',
  woff: 'font/woff',
  woff2: 'font/woff2'
};

function getMimeType(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.url.includes('/virtual-game/')) {
    event.respondWith((async () => {
      const cache = await caches.open('runaweb-virtual-game');
      // 1. Direct match with full request URL (ignoring search params)
      let match = await cache.match(event.request, { ignoreSearch: true });
      if (match) return match;

      // 2. Fallback: match by filename/pathname ending
      const keys = await cache.keys();
      const reqUrl = event.request.url;
      const target = reqUrl.substring(reqUrl.indexOf('/virtual-game/') + 14);

      for (const req of keys) {
        if (req.url.endsWith(target)) {
          return await cache.match(req);
        }
      }

      return new Response('404 Not Found in Virtual Game Storage', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      });
    })());
    return;
  }

  // Handle HTML navigation requests (`mode === 'navigate'`) -> MUST serve cached index.html when offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }
        } catch (err) {
          console.warn('Navigation fetch failed, returning cached index.html:', err);
        }

        const fallbackResponse =
          (await caches.match('./index.html')) ||
          (await caches.match('./')) ||
          (await caches.match(event.request));

        if (fallbackResponse) {
          return fallbackResponse;
        }

        return new Response('Offline and no cached index.html found.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/html' }
        });
      })()
    );
    return;
  }

  // Intercept App Shell / Bundles / External CDNs (Stale-While-Revalidate / Cache-First strategy)
  event.respondWith(
    (async () => {
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) {
        // Fetch background update if online (Stale-While-Revalidate)
        fetch(event.request)
          .then(async (networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              event.request.method === 'GET' &&
              !url.protocol.startsWith('chrome-extension')
            ) {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(event.request, networkResponse.clone());
            }
          })
          .catch(() => {
            // Offline, ignore network update error
          });
        return cachedResponse;
      }

      // Fallback to network if not in cache
      try {
        const networkResponse = await fetch(event.request);
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          event.request.method === 'GET' &&
          !url.protocol.startsWith('chrome-extension')
        ) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        console.warn('SW fetch failed (offline mode):', event.request.url, err);

        // Fail-safe handling for external CDN or fonts
        if (url.hostname.includes('cdn.jsdelivr.net') || url.hostname.includes('eruda')) {
          return new Response('/* Eruda CDN offline fallback */', {
            status: 200,
            headers: { 'Content-Type': 'text/javascript' }
          });
        }
        if (url.hostname.includes('fonts.googleapis.com')) {
          return new Response('', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        if (url.hostname.includes('fonts.gstatic.com')) {
          return new Response('', { status: 200 });
        }

        return new Response('Network error and no cache available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })()
  );
});
