import { unzipSync } from 'fflate';

let swRegistration: ServiceWorkerRegistration | null = null;
let currentFileMap: Record<string, Uint8Array> | null = null;

const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const gameFrame = document.getElementById('game-frame') as HTMLIFrameElement;
const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement;
const fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
const gameContainer = document.getElementById('game-container') as HTMLDivElement;

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      statusEl.textContent = 'Service Worker registered successfully.';
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      statusEl.textContent = 'Failed to register Service Worker.';
    }
  } else {
    statusEl.textContent = 'Service Worker is not supported in this browser.';
  }
}

async function getActiveServiceWorker(): Promise<ServiceWorker> {
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }
  if (swRegistration?.active) {
    return swRegistration.active;
  }
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (navigator.serviceWorker.controller) {
        clearInterval(interval);
        resolve(navigator.serviceWorker.controller);
      } else if (swRegistration?.active) {
        clearInterval(interval);
        resolve(swRegistration.active);
      }
    }, 100);
  });
}

function processZipBuffer(arrayBuffer: ArrayBuffer) {
  statusEl.textContent = 'Unzipping archive...';
  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const unzipped = unzipSync(uint8Array);

    const filePaths = Object.keys(unzipped);
    if (filePaths.length === 0) {
      statusEl.textContent = 'ZIP file is empty.';
      return;
    }

    // Check if all non-directory files share a common root directory
    const paths = filePaths.filter((p) => !p.endsWith('/'));
    let commonPrefix = '';
    if (paths.length > 0) {
      const firstPathParts = paths[0].split('/');
      if (firstPathParts.length > 1) {
        const potentialPrefix = firstPathParts[0] + '/';
        const allStartWithPrefix = paths.every((p) => p.startsWith(potentialPrefix));
        if (allStartWithPrefix) {
          commonPrefix = potentialPrefix;
        }
      }
    }

    const normalizedMap: Record<string, Uint8Array> = {};
    for (const rawPath of filePaths) {
      if (rawPath.endsWith('/')) continue; // Skip directory entries
      let cleanPath = rawPath;
      if (commonPrefix && cleanPath.startsWith(commonPrefix)) {
        cleanPath = cleanPath.slice(commonPrefix.length);
      }
      // Normalize slashes
      cleanPath = cleanPath.replace(/\\/g, '/').replace(/^\/+/, '');
      normalizedMap[cleanPath] = unzipped[rawPath];
    }

    if (!('index.html' in normalizedMap)) {
      statusEl.textContent = 'Warning: index.html not found at root of game archive.';
    } else {
      statusEl.textContent = 'Game extracted successfully. Launching...';
    }

    currentFileMap = normalizedMap;
    loadGame(normalizedMap);
  } catch (err) {
    console.error('Error processing zip file:', err);
    statusEl.textContent = 'Failed to extract ZIP archive.';
  }
}

async function loadGame(fileMap: Record<string, Uint8Array>) {
  const sw = await getActiveServiceWorker();
  sw.postMessage({
    type: 'SET_GAME_FILES',
    files: fileMap
  });

  // Small delay to ensure SW stores files before iframe fetch
  setTimeout(() => {
    gameFrame.src = '/virtual-game/index.html';
    reloadBtn.disabled = false;
    fullscreenBtn.disabled = false;
  }, 100);
}

function handleFileSelect(file: File) {
  if (!file.name.toLowerCase().endsWith('.zip')) {
    statusEl.textContent = 'Please select a valid .zip file.';
    return;
  }
  statusEl.textContent = `Reading ${file.name}...`;
  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) {
      processZipBuffer(e.target.result as ArrayBuffer);
    }
  };
  reader.readAsArrayBuffer(file);
}

// Drag & Drop
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    handleFileSelect(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    handleFileSelect(target.files[0]);
  }
});

reloadBtn.addEventListener('click', () => {
  if (currentFileMap) {
    loadGame(currentFileMap);
  } else if (gameFrame.src) {
    gameFrame.src = gameFrame.src;
  }
});

fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    if (gameContainer.requestFullscreen) {
      gameContainer.requestFullscreen();
    }
  }
});

// Initialize Service Worker
registerServiceWorker();
