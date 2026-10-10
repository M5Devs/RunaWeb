// Service Worker for RunaWeb - Intercepts and serves virtual game assets

let gameFiles = new Map();

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_GAME_FILES') {
    const files = event.data.files; // object { [path: string]: Uint8Array }
    gameFiles.clear();
    for (const path in files) {
      if (Object.prototype.hasOwnProperty.call(files, path)) {
        // Normalize path: strip leading slashes and convert backslashes to forward slashes
        const normalizedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
        gameFiles.set(normalizedPath, files[path]);
      }
    }
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

  // Check if pathname contains /virtual-game/ to support base path deployments (e.g. /RunaWeb/virtual-game/...)
  const vgameIndex = url.pathname.indexOf('/virtual-game');
  if (vgameIndex !== -1) {
    event.respondWith(
      (async () => {
        let relativePath = url.pathname.slice(vgameIndex + '/virtual-game'.length);
        if (relativePath.startsWith('/')) {
          relativePath = relativePath.slice(1);
        }

        if (!relativePath || relativePath === '') {
          relativePath = 'index.html';
        }

        // Search for relativePath in gameFiles
        let fileData = gameFiles.get(relativePath);

        // Fallback: if not found directly, try case-insensitive or decoded URL path
        if (!fileData) {
          const decodedPath = decodeURIComponent(relativePath);
          fileData = gameFiles.get(decodedPath);
        }

        if (fileData) {
          const mimeType = getMimeType(relativePath);
          return new Response(fileData, {
            status: 200,
            headers: {
              'Content-Type': mimeType,
              'Content-Length': fileData.byteLength.toString(),
              'Cache-Control': 'no-cache'
            }
          });
        }

        return new Response('404 Not Found in Virtual Game Storage', {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/plain' }
        });
      })()
    );
  }
});
