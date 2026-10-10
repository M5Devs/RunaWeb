import { unzipSync } from 'fflate';

declare global {
  interface Window {
    eruda?: {
      init: (options?: Record<string, unknown>) => void;
      show: () => void;
      hide: () => void;
      destroy: () => void;
      _isInit?: boolean;
    };
  }
}

let swRegistration: ServiceWorkerRegistration | null = null;
let currentFileMap: Record<string, Uint8Array> | null = null;
let currentEntryPath: string = 'index.html';

const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const gameFrame = document.getElementById('game-frame') as HTMLIFrameElement;
const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement;
const fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
const gameContainer = document.getElementById('game-container') as HTMLDivElement;
const gamepadToggleBtn = document.getElementById('gamepad-toggle-btn') as HTMLButtonElement;
const debugToggleBtn = document.getElementById('debug-toggle-btn') as HTMLButtonElement;
const virtualGamepad = document.getElementById('virtual-gamepad') as HTMLDivElement;

const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + '/';

let erudaActive = false;

function setupErudaDevTools() {
  if (!debugToggleBtn) return;

  debugToggleBtn.addEventListener('click', () => {
    if (!window.eruda) {
      statusEl.textContent = 'Eruda script not loaded.';
      return;
    }

    if (!erudaActive) {
      if (!window.eruda._isInit) {
        window.eruda.init();
      }
      window.eruda.show();
      erudaActive = true;
      debugToggleBtn.classList.add('active');
    } else {
      window.eruda.hide();
      erudaActive = false;
      debugToggleBtn.classList.remove('active');
    }
  });
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const swUrl = baseUrl + 'sw.js';
      swRegistration = await navigator.serviceWorker.register(swUrl, { scope: baseUrl });
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

function processExtractedFiles(unzipped: Record<string, Uint8Array>): {
  normalizedMap: Record<string, Uint8Array>;
  entryPath: string;
} {
  const filePaths = Object.keys(unzipped);

  // Filter out directory entries
  let paths = filePaths
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !p.endsWith('/'));

  // Detect common root prefix iteratively
  let commonPrefix = '';
  while (paths.length > 0) {
    const firstPathParts = paths[0].split('/');
    if (firstPathParts.length <= 1) break;

    const potentialPrefix = firstPathParts[0] + '/';
    const allStartWithPrefix = paths.every(
      (p) => p.startsWith(potentialPrefix) && p.length > potentialPrefix.length
    );

    if (allStartWithPrefix) {
      commonPrefix += potentialPrefix;
      paths = paths.map((p) => p.slice(potentialPrefix.length));
    } else {
      break;
    }
  }

  const normalizedMap: Record<string, Uint8Array> = {};
  for (const rawPath of filePaths) {
    const normalizedRaw = rawPath.replace(/\\/g, '/');
    if (normalizedRaw.endsWith('/')) continue; // Skip directory entries

    let cleanPath = normalizedRaw;
    if (commonPrefix && cleanPath.startsWith(commonPrefix)) {
      cleanPath = cleanPath.slice(commonPrefix.length);
    }
    // Normalize slashes and strip leading slashes (e.g. ensure index.html, not /index.html)
    cleanPath = cleanPath.replace(/^\/+/, '');
    if (cleanPath) {
      normalizedMap[cleanPath] = unzipped[rawPath];
    }
  }

  // Find actual entry point: Look for index.html anywhere in the zip hierarchy
  let entryPath = 'index.html';
  if ('index.html' in normalizedMap) {
    entryPath = 'index.html';
  } else {
    const keys = Object.keys(normalizedMap);
    const exactIndex = keys.find((k) => k.toLowerCase() === 'index.html');
    if (exactIndex) {
      entryPath = exactIndex;
    } else {
      const nestedIndex = keys.find((k) => k.toLowerCase().endsWith('/index.html'));
      if (nestedIndex) {
        entryPath = nestedIndex;
      }
    }
  }

  return { normalizedMap, entryPath };
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

    const { normalizedMap, entryPath } = processExtractedFiles(unzipped);

    if (Object.keys(normalizedMap).length === 0) {
      statusEl.textContent = 'ZIP file is empty or contains no valid files.';
      return;
    }

    if (!(entryPath in normalizedMap)) {
      statusEl.textContent = 'Warning: index.html not found in game archive.';
    } else {
      statusEl.textContent = 'Game extracted successfully. Launching...';
    }

    currentFileMap = normalizedMap;
    currentEntryPath = entryPath;
    loadGame(normalizedMap, entryPath);
  } catch (err) {
    console.error('Error processing zip file:', err);
    statusEl.textContent = 'Failed to extract ZIP archive.';
  }
}

async function loadGame(fileMap: Record<string, Uint8Array>, entryPath: string = 'index.html') {
  currentEntryPath = entryPath;
  const sw = await getActiveServiceWorker();
  sw.postMessage({
    type: 'SET_GAME_FILES',
    files: fileMap
  });

  // Small delay to ensure SW stores files before iframe fetch
  setTimeout(() => {
    const cleanEntry = entryPath.replace(/^\/+/, '');
    gameFrame.src = baseUrl + 'virtual-game/' + cleanEntry;
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
    loadGame(currentFileMap, currentEntryPath);
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

// --- Touch Control / Virtual Gamepad Engine ---

interface KeyMapping {
  key: string;
  code: string;
  keyCode: number;
}

const BUTTON_KEY_MAPPINGS: Record<string, KeyMapping[]> = {
  ArrowUp: [{ key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 }, { key: 'w', code: 'KeyW', keyCode: 87 }],
  ArrowDown: [{ key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, { key: 's', code: 'KeyS', keyCode: 83 }],
  ArrowLeft: [{ key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, { key: 'a', code: 'KeyA', keyCode: 65 }],
  ArrowRight: [{ key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 }, { key: 'd', code: 'KeyD', keyCode: 68 }],
  A: [{ key: ' ', code: 'Space', keyCode: 32 }],
  B: [{ key: 'z', code: 'KeyZ', keyCode: 90 }, { key: 'Escape', code: 'Escape', keyCode: 27 }],
  X: [{ key: 'x', code: 'KeyX', keyCode: 88 }],
  Y: [{ key: 'c', code: 'KeyC', keyCode: 67 }, { key: 'Enter', code: 'Enter', keyCode: 13 }],
  SELECT: [{ key: 'Tab', code: 'Tab', keyCode: 9 }, { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }],
  START: [{ key: 'Enter', code: 'Enter', keyCode: 13 }, { key: 'p', code: 'KeyP', keyCode: 80 }]
};

function dispatchKeyEvent(type: 'keydown' | 'keyup', mapping: KeyMapping) {
  const targetWindow = gameFrame.contentWindow;
  const targetDocument = gameFrame.contentDocument;

  if (!targetWindow || !targetDocument) return;

  const eventInit: KeyboardEventInit = {
    key: mapping.key,
    code: mapping.code,
    keyCode: mapping.keyCode,
    which: mapping.keyCode,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: targetWindow
  };

  const event = new KeyboardEvent(type, eventInit);
  Object.defineProperty(event, 'keyCode', { get: () => mapping.keyCode });
  Object.defineProperty(event, 'which', { get: () => mapping.keyCode });

  targetDocument.dispatchEvent(event);
  if (targetDocument.activeElement && targetDocument.activeElement !== targetDocument.body) {
    targetDocument.activeElement.dispatchEvent(event);
  } else {
    targetWindow.dispatchEvent(event);
  }
}

function handleButtonPress(btnKey: string, type: 'keydown' | 'keyup') {
  const mappings = BUTTON_KEY_MAPPINGS[btnKey];
  if (mappings) {
    mappings.forEach((m) => dispatchKeyEvent(type, m));
  }
}

function setupVirtualGamepad() {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (isTouchDevice) {
    virtualGamepad.classList.remove('hidden');
    gamepadToggleBtn.classList.add('active');
  }

  gamepadToggleBtn.addEventListener('click', () => {
    const isHidden = virtualGamepad.classList.toggle('hidden');
    gamepadToggleBtn.classList.toggle('active', !isHidden);
  });

  const buttons = virtualGamepad.querySelectorAll<HTMLButtonElement>('button');

  buttons.forEach((btn) => {
    const btnKey = btn.getAttribute('data-key') || btn.getAttribute('data-button');
    if (!btnKey) return;

    // Prevent default touch behaviors (zoom, scroll, focus loss, selection)
    const handleStart = (e: Event) => {
      e.preventDefault();
      btn.classList.add('pressed');
      handleButtonPress(btnKey, 'keydown');
    };

    const handleEnd = (e: Event) => {
      e.preventDefault();
      btn.classList.remove('pressed');
      handleButtonPress(btnKey, 'keyup');
    };

    btn.addEventListener('touchstart', handleStart, { passive: false });
    btn.addEventListener('touchend', handleEnd, { passive: false });
    btn.addEventListener('touchcancel', handleEnd, { passive: false });

    // Fallback for desktop mouse testing
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      handleButtonPress(btnKey, 'keydown');
    });

    btn.addEventListener('mouseup', (e) => {
      e.preventDefault();
      btn.classList.remove('pressed');
      handleButtonPress(btnKey, 'keyup');
    });

    btn.addEventListener('mouseleave', (e) => {
      if (btn.classList.contains('pressed')) {
        e.preventDefault();
        btn.classList.remove('pressed');
        handleButtonPress(btnKey, 'keyup');
      }
    });
  });
}

// Initialize Service Worker, Eruda, and Touch Gamepad
registerServiceWorker();
setupErudaDevTools();
setupVirtualGamepad();
