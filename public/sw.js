// Service Worker for RunaWeb - Intercepts and serves virtual game assets

let gameFiles = new Map();

self.addEventListener('install', () => {
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

  // Match any URL containing virtual-game/
  const match = url.pathname.match(/virtual-game\/(.*)$/);
  if (!match) return;

  event.respondWith(
    (async () => {
      let relativePath = decodeURIComponent(match[1]);
      if (!relativePath || relativePath.endsWith('/')) {
        relativePath += 'index.html';
      }
      relativePath = relativePath.replace(/^\/+/, ''); // strip leading slash

      // Search for relativePath in gameFiles
      let fileData = gameFiles.get(relativePath);

      // Fallback check: if missing, try with/without leading ./ or case-insensitively
      if (!fileData) {
        const withoutDotSlash = relativePath.replace(/^\.\//, '');
        const withDotSlash = './' + withoutDotSlash;

        if (gameFiles.has(withoutDotSlash)) {
          fileData = gameFiles.get(withoutDotSlash);
        } else if (gameFiles.has(withDotSlash)) {
          fileData = gameFiles.get(withDotSlash);
        } else {
          const targetLower = relativePath.toLowerCase();
          const targetWithoutDotSlashLower = withoutDotSlash.toLowerCase();
          for (const [key, data] of gameFiles.entries()) {
            const keyLower = key.toLowerCase();
            if (keyLower === targetLower || keyLower === targetWithoutDotSlashLower) {
              fileData = data;
              break;
            }
          }
        }
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
});
