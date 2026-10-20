import { VirtualKeyboardManager } from './keyboard';
import { getKeybindings, InputAction, setupControlsModal } from './controls';
import { generateWasm4Html, isWasm4File } from './wasm4';
import { unzip, Unzipped } from 'fflate';
import { saveGame, getSavedGames, loadGameById, deleteGame, SavedGame } from './storage';
import { PhysicalGamepadManager } from './gamepad';
import { processExtractedFiles, validateSaveState, isProtectedKey, normalizePath, generateSessionToken, validateIPCMessage } from './engine';
import { setupTouchEditorModal, applyTouchLayoutToDOM } from './touch-editor';

declare global {
  interface Window {
    eruda?: {
      init: (options?: Record<string, unknown>) => void;
      show: () => void;
      hide: () => void;
      destroy: () => void;
      _isInit?: boolean;
    };
    __runa_orig_raf?: typeof window.requestAnimationFrame;
    __runa_raf_speed_set?: boolean;
    __runa_speed_mult?: number;
    __runaAudioContext?: AudioContext | null;
  }
}

let sharedAudioCtx: AudioContext | null = null;
export function getSharedAudioContext(): AudioContext | null {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

// Unlock on real user gestures in host window
['pointerdown', 'touchstart', 'mousedown', 'keydown'].forEach((evt) => {
  window.addEventListener(evt, () => getSharedAudioContext(), { passive: true });
});

// Attach to window so same-origin iframe can access it directly
(window as any).__runaAudioContext = getSharedAudioContext();

// Internal app storage prefix
const HOST_APP_KEY_PREFIX = 'runaweb_app_';

// swRegistration
let currentFileMap: Record<string, Uint8Array> | null = null;
let currentEntryPath: string = 'index.html';
let activeGameName: string = 'active_game';
let currentSessionToken: string | null = null;

const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const gameFrame = document.getElementById('game-frame') as HTMLIFrameElement;
const gameWrapper = document.getElementById('game-wrapper') as HTMLDivElement;
const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement;
const fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
const exitBtn = document.getElementById('exit-btn') as HTMLButtonElement;
const collapseBtn = document.getElementById('collapse-btn') as HTMLButtonElement;
const floatingHudPill = document.getElementById('floating-hud-pill') as HTMLButtonElement;
const appHeader = document.getElementById('app-header') as HTMLElement;
const gameContainer = document.getElementById('game-container') as HTMLDivElement;
const gamepadToggleBtn = document.getElementById('gamepad-toggle-btn') as HTMLButtonElement;
const debugToggleBtn = document.getElementById('debug-toggle-btn') as HTMLButtonElement;
const virtualGamepad = document.getElementById('virtual-gamepad') as HTMLDivElement;
const libraryGrid = document.getElementById('library-grid') as HTMLDivElement;
const toastContainer = document.getElementById('toast-container') as HTMLDivElement;

// Resume Banner Elements
const resumeBanner = document.getElementById('resume-banner') as HTMLDivElement;
const resumeGameTitle = document.getElementById('resume-game-title') as HTMLSpanElement;
const resumeGameBtn = document.getElementById('resume-game-btn') as HTMLButtonElement;
const terminateGameBtn = document.getElementById('terminate-game-btn') as HTMLButtonElement;

// Progress Loading Modal Elements
const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
const loadingTitle = document.getElementById('loading-title') as HTMLHeadingElement;
const loadingStatus = document.getElementById('loading-status') as HTMLParagraphElement;
const loadingProgressBar = document.getElementById('loading-progress-bar') as HTMLDivElement;

// Emulator Controls Elements
const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
const fastForwardBtn = document.getElementById('fast-forward-btn') as HTMLButtonElement;
const aspectBtn = document.getElementById('aspect-btn') as HTMLButtonElement;
const crtBtn = document.getElementById('crt-btn') as HTMLButtonElement;
const pauseOverlay = document.getElementById('pause-overlay') as HTMLDivElement;

// Save Modal Elements
const savesToggleBtn = document.getElementById('saves-toggle-btn') as HTMLButtonElement;
const saveModal = document.getElementById('save-modal') as HTMLDivElement;
const closeSaveModalBtn = document.getElementById('close-save-modal') as HTMLButtonElement;
const exportSaveBtn = document.getElementById('export-save-btn') as HTMLButtonElement;
const importSaveBtn = document.getElementById('import-save-btn') as HTMLButtonElement;
const importSaveInput = document.getElementById('import-save-input') as HTMLInputElement;
const saveModalStatus = document.getElementById('save-modal-status') as HTMLDivElement;

const baseUrl = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : import.meta.env.BASE_URL + '/';

let erudaActive = false;

interface SuspendedGame {
  title: string;
  fileMap: Record<string, Uint8Array> | null;
  entryPath: string;
  timestamp: number;
}

let activeSuspendedGame: SuspendedGame | null = null;

// HUD Auto-Hide & Collapse State
let autoHideTimer: number | null = null;
let isHeaderPinned = false;
let currentMode: 'hub' | 'theater' = 'hub';

// Emulator State
let isPaused = false;
let isFastForward = false;
type AspectRatioMode = 'fit' | '4-3' | '16-9';
let currentAspectRatio: AspectRatioMode = 'fit';
let isCrtEnabled = false;

function setAppConfig(key: string, value: string) {
  try {
    const prefixedKey = key.startsWith(HOST_APP_KEY_PREFIX) ? key : `${HOST_APP_KEY_PREFIX}${key}`;
    localStorage.setItem(prefixedKey, value);
  } catch (err) {
    console.warn('Failed to set app config:', err);
  }
}

function showProgressModal(title: string, statusText: string, progressPercent: number) {
  if (!loadingOverlay) return;
  if (loadingTitle) loadingTitle.textContent = title;
  if (loadingStatus) loadingStatus.textContent = statusText;
  if (loadingProgressBar) loadingProgressBar.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
  loadingOverlay.classList.remove('hidden');
}

function updateProgressModal(statusText: string, progressPercent: number) {
  if (loadingStatus) loadingStatus.textContent = statusText;
  if (loadingProgressBar) loadingProgressBar.style.width = `${Math.min(100, Math.max(0, progressPercent))}%`;
}

function hideProgressModal() {
  if (!loadingOverlay) return;
  loadingOverlay.classList.add('hidden');
}

function showToast(message: string) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function resetAutoHideTimer() {
  if (autoHideTimer !== null) {
    window.clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  if (currentMode === 'theater' && !isHeaderPinned) {
    autoHideTimer = window.setTimeout(() => {
      if (currentMode === 'theater' && !isHeaderPinned) {
        collapseHeader();
      }
    }, 3500);
  }
}

function expandHeader() {
  appHeader.classList.remove('hud-collapsed', 'hud-hidden');
  resetAutoHideTimer();
}

function collapseHeader() {
  appHeader.classList.add('hud-collapsed');
}

function setupHudControls() {
  if (collapseBtn) {
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      collapseHeader();
    });
  }

  if (floatingHudPill) {
    floatingHudPill.addEventListener('click', (e) => {
      e.stopPropagation();
      expandHeader();
    });
  }

  const handleActivity = (e: MouseEvent | TouchEvent) => {
    if (currentMode !== 'theater') return;

    let clientY = 0;
    if (e instanceof MouseEvent) {
      clientY = e.clientY;
    } else if (e.touches && e.touches.length > 0) {
      clientY = e.touches[0].clientY;
    }

    if (appHeader.classList.contains('hud-collapsed') || appHeader.classList.contains('hud-hidden')) {
      if (clientY <= 30) {
        expandHeader();
      }
    } else {
      resetAutoHideTimer();
    }
  };

  window.addEventListener('mousemove', handleActivity);
  window.addEventListener('touchstart', handleActivity, { passive: true });

  window.addEventListener('click', (e) => {
    if (currentMode !== 'theater') return;
    const target = e.target as Node;
    if (
      !appHeader.contains(target) &&
      !floatingHudPill.contains(target) &&
      (!saveModal || saveModal.classList.contains('hidden') || !saveModal.contains(target))
    ) {
      collapseHeader();
    }
  });

  appHeader.addEventListener('mouseenter', () => {
    if (autoHideTimer !== null) {
      window.clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  });

  appHeader.addEventListener('mouseleave', () => {
    resetAutoHideTimer();
  });
}

function unlockIframeAudio() {
  try {
    getSharedAudioContext();
    if (gameFrame && gameFrame.contentWindow) {
      gameFrame.contentWindow.postMessage({ type: 'RUNAWEB_AUDIO_UNLOCK' }, '*');
    }
  } catch (err) {
    console.warn('Failed to send audio unlock message to game frame:', err);
  }
}

function sendHandshake() {
  if (currentSessionToken) {
    const handshakeMsg = { type: 'RUNAWEB_INIT_HANDSHAKE', sessionToken: currentSessionToken };
    if (gameFrame && gameFrame.contentWindow) {
      try {
        gameFrame.contentWindow.postMessage(handshakeMsg, '*');
      } catch (err) {
        console.warn('Failed to post handshake to game frame:', err);
      }
    }
    try {
      window.postMessage(handshakeMsg, '*');
    } catch (err) {
      console.warn('Failed to post handshake to window:', err);
    }
  }
}

function configureIframeIsolation() {
  if (gameFrame) {
    gameFrame.allow = 'autoplay';
    gameFrame.referrerPolicy = 'no-referrer';
    gameFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-forms');
    gameFrame.addEventListener('load', () => {
      sendHandshake();
    });
  }

  // Defensive global error handling for parent DOM traversal / cross-origin sandbox exceptions
  window.addEventListener('error', (event) => {
    if (
      event.message &&
      (event.message.includes('Permission denied') ||
       event.message.includes('Blocked a frame') ||
       event.message.includes('SecurityError'))
    ) {
      console.warn('Caught cross-origin/sandbox DOM traversal attempt from game script:', event.message);
      event.preventDefault();
    }
  });
}

const ALLOWED_IPC_TYPES = Object.freeze(['RUNAWEB_GAME_PAUSE', 'RUNAWEB_GAME_RELOAD'] as const);

function setupMessageIsolation() {
  const handleHostMessage = (event: MessageEvent) => {
    // Validate message source is from game iframe or host window
    if (gameFrame && event.source !== gameFrame.contentWindow && event.source !== window) {
      return;
    }

    // Validate origin match or null/empty (iframe data/blob/about/virtual scope)
    if (event.origin !== window.location.origin && event.origin !== 'null' && event.origin !== '') {
      return;
    }

    const data = event.data;
    if (!validateIPCMessage(data, currentSessionToken)) {
      return;
    }

    if (!ALLOWED_IPC_TYPES.includes(data.type as any)) {
      return;
    }

    // Process known application level IPC commands securely
    if (data.type === 'RUNAWEB_GAME_PAUSE') {
      togglePause();
    } else if (data.type === 'RUNAWEB_GAME_RELOAD') {
      if (currentFileMap) loadGame(currentFileMap, currentEntryPath);
    }
  };

  // Seal the message handler wrapper to guard against host state mutation/tampering
  Object.freeze(handleHostMessage);

  window.addEventListener('message', handleHostMessage);
}

function pauseIframeAudioAndLoop() {
  try {
    const win = gameFrame.contentWindow as Window | null;
    if (win) {
      const audios = win.document.querySelectorAll('audio, video');
      audios.forEach((a) => (a as HTMLMediaElement).pause());
      if (!win.__runa_orig_raf) {
        win.__runa_orig_raf = win.requestAnimationFrame;
        win.requestAnimationFrame = () => 0;
      }
    }
  } catch (err) {
    console.warn('Iframe suspend pause notice:', err);
  }
}

function resumeIframeAudioAndLoop() {
  try {
    const win = gameFrame.contentWindow as Window | null;
    if (win) {
      if (win.__runa_orig_raf) {
        win.requestAnimationFrame = win.__runa_orig_raf;
        delete win.__runa_orig_raf;
      }
      if (!isPaused) {
        const audios = win.document.querySelectorAll('audio, video');
        audios.forEach((a) => (a as HTMLMediaElement).play().catch(() => {}));
      }
    }
  } catch (err) {
    console.warn('Iframe resume notice:', err);
  }
}

function suspendGame() {
  if (currentMode !== 'theater') return;

  activeSuspendedGame = {
    title: activeGameName,
    fileMap: currentFileMap,
    entryPath: currentEntryPath,
    timestamp: Date.now()
  };

  pauseIframeAudioAndLoop();

  if (resumeGameTitle) {
    resumeGameTitle.textContent = activeSuspendedGame.title;
  }
  if (resumeBanner) {
    resumeBanner.classList.remove('hidden');
  }

  setViewMode('hub');
}

function resumeGame() {
  if (!activeSuspendedGame) return;

  if (resumeBanner) {
    resumeBanner.classList.add('hidden');
  }

  setViewMode('theater');
  resumeIframeAudioAndLoop();
}

function terminateGame() {
  activeSuspendedGame = null;
  if (resumeBanner) {
    resumeBanner.classList.add('hidden');
  }

  currentSessionToken = null;
  currentFileMap = null;
  gameFrame.src = 'about:blank';

  if (currentMode === 'hub') {
    reloadBtn.disabled = true;
    fullscreenBtn.disabled = true;
  }
}

function setViewMode(mode: 'hub' | 'theater') {
  currentMode = mode;
  if (mode === 'theater') {
    document.body.classList.remove('mode-hub');
    document.body.classList.add('mode-theater', 'is-playing');
    if (exitBtn) exitBtn.style.display = 'inline-flex';

    pauseBtn.disabled = false;
    fastForwardBtn.disabled = false;
    aspectBtn.disabled = false;
    crtBtn.disabled = false;
    reloadBtn.disabled = false;
    fullscreenBtn.disabled = false;

    isHeaderPinned = false;
    expandHeader();
  } else {
    document.body.classList.remove('mode-theater', 'is-playing');
    document.body.classList.add('mode-hub');
    if (exitBtn) exitBtn.style.display = 'none';

    pauseBtn.disabled = true;
    fastForwardBtn.disabled = true;
    aspectBtn.disabled = true;
    crtBtn.disabled = true;

    // Reset emulator states when returning to hub
    if (isPaused) togglePause();
    if (isFastForward) toggleFastForward();

    if (autoHideTimer !== null) {
      window.clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    appHeader.classList.remove('hud-collapsed', 'hud-hidden');

    reloadBtn.disabled = true;
    fullscreenBtn.disabled = true;
  }
}

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
      setAppConfig('eruda_active', 'true');
    } else {
      window.eruda.hide();
      erudaActive = false;
      debugToggleBtn.classList.remove('active');
      setAppConfig('eruda_active', 'false');
    }
  });
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const swUrl = baseUrl + 'sw.js';
      await navigator.serviceWorker.register(swUrl, { scope: baseUrl });
      statusEl.textContent = 'Service Worker registered successfully.';
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      statusEl.textContent = 'Failed to register Service Worker.';
    }
  } else {
    statusEl.textContent = 'Service Worker is not supported in this browser.';
  }
}

// Cover Detection Engine
const COVER_NAMES = ['cover.png', 'cover.jpg', 'cover.jpeg', 'icon.png', 'thumbnail.png', 'favicon.ico'];

function detectCoverImage(normalizedMap: Record<string, Uint8Array>): string | undefined {
  const keys = Object.keys(normalizedMap);
  for (const candidate of COVER_NAMES) {
    const match = keys.find((k) => k.toLowerCase() === candidate || k.toLowerCase().endsWith('/' + candidate));
    if (match) {
      const fileBuffer = normalizedMap[match];
      const ext = match.split('.').pop()?.toLowerCase() || 'png';
      let mime = 'image/png';
      if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
      else if (ext === 'ico') mime = 'image/x-icon';

      let binary = '';
      const len = fileBuffer.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(fileBuffer[i]);
      }
      const base64 = window.btoa(binary);
      return `data:${mime};base64,${base64}`;
    }
  }
  return undefined;
}

function extractGameTitle(normalizedMap: Record<string, Uint8Array>, entryPath: string, defaultName: string): string {
  try {
    const entryData = normalizedMap[entryPath];
    if (entryData) {
      const htmlText = new TextDecoder('utf-8').decode(entryData);
      const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1].trim()) {
        const extracted = titleMatch[1].trim();
        if (extracted !== 'Document' && extracted !== 'Untitled') {
          return extracted;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to extract title from index.html:', err);
  }
  return defaultName.replace(/\.(zip|html|htm)$/i, '');
}

function unzipAsync(uint8Array: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(uint8Array, (err, unzipped) => {
      if (err) {
        reject(err);
      } else {
        resolve(unzipped);
      }
    });
  });
}

async function processWasmBuffer(arrayBuffer: ArrayBuffer, fileName: string) {
  showProgressModal('Processing WASM-4 Cartridge', 'Generating WASM-4 micro-runtime...', 30);
  statusEl.textContent = 'Preparing WASM-4 cartridge...';

  try {
    const wasmBytes = new Uint8Array(arrayBuffer);
    const htmlRuntimeStr = generateWasm4Html();
    const htmlBytes = new TextEncoder().encode(htmlRuntimeStr);

    const normalizedMap: Record<string, Uint8Array> = {
      'cart.wasm': wasmBytes,
      'index.html': htmlBytes
    };
    const entryPath = 'index.html';

    const cleanTitle = fileName.replace(/\.wasm$/i, '').replace(/[-_]/g, ' ').trim() || 'WASM-4 Game';
    activeGameName = cleanTitle;
    currentFileMap = normalizedMap;
    currentEntryPath = entryPath;

    updateProgressModal('Populating virtual cache...', 70);
    await loadGame(normalizedMap, entryPath);

    hideProgressModal();

    const gameId = 'wasm4_' + fileName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '_' + Date.now();
    const gameRecord: SavedGame = {
      id: gameId,
      name: cleanTitle,
      date: Date.now(),
      zipData: arrayBuffer,
      size: arrayBuffer.byteLength,
      isWasm4: true
    };

    try {
      await saveGame(gameRecord);
      await refreshGameLibrary();
    } catch (saveErr) {
      console.error('Failed to save WASM-4 game to IndexedDB:', saveErr);
      if (saveErr instanceof Error && (saveErr.name === 'QuotaExceededError' || saveErr.message.includes('QuotaExceededError'))) {
        showToast('Storage full! Please delete some saved games from your library to free up space.');
      } else {
        showToast('Could not save WASM-4 game to local library.');
      }
    }
  } catch (err) {
    console.error('Error processing WASM-4 cartridge:', err);
    hideProgressModal();
    statusEl.textContent = 'Failed to load WASM-4 cartridge.';
    showToast('Failed to load WASM-4 cartridge.');
  }
}

async function processHtmlBuffer(arrayBuffer: ArrayBuffer, fileName: string) {
  showProgressModal('Processing Single HTML Game', 'Preparing game file...', 30);
  statusEl.textContent = 'Preparing single HTML file...';

  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const normalizedMap: Record<string, Uint8Array> = { 'index.html': uint8Array };
    const entryPath = 'index.html';

    const title = extractGameTitle(normalizedMap, entryPath, fileName);
    activeGameName = title;
    currentFileMap = normalizedMap;
    currentEntryPath = entryPath;

    updateProgressModal('Populating virtual cache...', 70);
    await loadGame(normalizedMap, entryPath);

    hideProgressModal();

    const gameId = fileName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '_' + Date.now();
    const gameRecord: SavedGame = {
      id: gameId,
      name: title,
      date: Date.now(),
      zipData: arrayBuffer,
      size: arrayBuffer.byteLength,
      isSingleHtml: true
    };

    try {
      await saveGame(gameRecord);
      await refreshGameLibrary();
    } catch (saveErr) {
      console.error('Failed to save game to IndexedDB:', saveErr);
      if (saveErr instanceof Error && (saveErr.name === 'QuotaExceededError' || saveErr.message.includes('QuotaExceededError'))) {
        showToast('Storage full! Please delete some saved games from your library to free up space.');
      } else {
        showToast('Could not save game to local library.');
      }
    }
  } catch (err) {
    console.error('Error processing HTML file:', err);
    hideProgressModal();
    statusEl.textContent = 'Failed to load HTML file.';
    showToast('Failed to load HTML file.');
  }
}

async function processZipBuffer(arrayBuffer: ArrayBuffer, fileName: string) {
  showProgressModal('Processing Game Archive', 'Decompressing game files...', 25);
  statusEl.textContent = 'Decompressing archive...';

  try {
    const uint8Array = new Uint8Array(arrayBuffer);
    const unzipped = await unzipAsync(uint8Array);

    updateProgressModal('Analyzing extracted archive...', 50);

    const filePaths = Object.keys(unzipped);
    if (filePaths.length === 0) {
      hideProgressModal();
      statusEl.textContent = 'ZIP file is empty.';
      showToast('Error: ZIP file is empty.');
      return;
    }

    const { normalizedMap, entryPath } = processExtractedFiles(unzipped);

    if (Object.keys(normalizedMap).length === 0) {
      hideProgressModal();
      statusEl.textContent = 'ZIP file is empty or contains no valid files.';
      showToast('Error: ZIP file contains no valid files.');
      return;
    }

    if (!(entryPath in normalizedMap)) {
      statusEl.textContent = 'Warning: index.html not found in game archive.';
    } else {
      statusEl.textContent = 'Game extracted successfully. Launching...';
    }

    currentFileMap = normalizedMap;
    currentEntryPath = entryPath;
    const title = extractGameTitle(normalizedMap, entryPath, fileName);
    activeGameName = title;

    const coverUrl = detectCoverImage(normalizedMap);

    updateProgressModal('Populating virtual cache...', 75);
    await loadGame(normalizedMap, entryPath);

    hideProgressModal();

    const gameId = fileName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '_' + Date.now();
    const gameRecord: SavedGame = {
      id: gameId,
      name: title,
      date: Date.now(),
      zipData: arrayBuffer,
      size: arrayBuffer.byteLength,
      coverUrl
    };

    try {
      await saveGame(gameRecord);
      await refreshGameLibrary();
    } catch (saveErr) {
      console.error('Failed to save game to IndexedDB:', saveErr);
      if (saveErr instanceof Error && (saveErr.name === 'QuotaExceededError' || saveErr.message.includes('QuotaExceededError'))) {
        showToast('Storage full! Please delete some saved games from your library to free up space.');
      } else {
        showToast('Could not save game to local library.');
      }
    }

  } catch (err) {
    console.error('Error processing zip file:', err);
    hideProgressModal();
    statusEl.textContent = 'Failed to extract ZIP archive.';
    showToast('Failed to extract ZIP archive.');
  }
}

const MIME_TYPES: Record<string, string> = {
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

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

async function loadGame(fileMap: Record<string, Uint8Array>, entryPath: string = 'index.html') {
  if (activeSuspendedGame) {
    terminateGame();
  }
  const sessionToken = generateSessionToken();
  currentSessionToken = sessionToken;
  currentEntryPath = entryPath;

  const cache = await caches.open('runaweb-virtual-game');
  const keys = await cache.keys();
  await Promise.all(keys.map((req) => cache.delete(req)));

  const totalFiles = Object.keys(fileMap).length;
  let cachedCount = 0;

  const cachePromises: Promise<void>[] = [];
  for (const path in fileMap) {
    if (Object.prototype.hasOwnProperty.call(fileMap, path)) {
      const normalizedPath = normalizePath(path);
      const fileBuffer = fileMap[path];
      const mimeType = getMimeType(normalizedPath);

      const fileUrl = new URL(`${import.meta.env.BASE_URL}virtual-game/${normalizedPath}`, window.location.origin).href;
      const response = new Response(fileBuffer.slice(), {
        headers: {
          'Content-Type': mimeType,
          'Content-Length': fileBuffer.byteLength.toString(),
          'Cache-Control': 'no-cache'
        }
      });
      cachePromises.push(
        cache.put(fileUrl, response)
          .then(() => {
            cachedCount++;
            if (totalFiles > 0 && loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
              const pct = 75 + Math.round((cachedCount / totalFiles) * 20);
              updateProgressModal(`Populating virtual cache (${cachedCount}/${totalFiles})...`, pct);
            }
          })
          .catch((err) => {
            console.error(`Cache put failed for ${fileUrl}:`, err);
          })
      );
    }
  }

  await Promise.all(cachePromises);

  setViewMode('theater');

  const cleanEntry = normalizePath(entryPath);
  const entryUrl = new URL(`${import.meta.env.BASE_URL}virtual-game/${cleanEntry}`, window.location.origin).href;
  if (gameFrame) {
    gameFrame.allow = 'autoplay';
    gameFrame.referrerPolicy = 'no-referrer';
    gameFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allow-forms');
    gameFrame.src = entryUrl;
  }
  reloadBtn.disabled = false;
  fullscreenBtn.disabled = false;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function refreshGameLibrary() {
  if (!libraryGrid) return;

  try {
    const games = await getSavedGames();
    libraryGrid.replaceChildren();

    if (games.length === 0) {
      const emptyContainer = document.createElement('div');
      emptyContainer.className = 'library-empty';

      const emptyIcon = document.createElement('span');
      emptyIcon.className = 'library-empty-icon';
      emptyIcon.textContent = '👾';

      const emptyText = document.createElement('p');
      emptyText.textContent = 'Your arcade shelf is empty! Drop a game to start your collection.';

      emptyContainer.appendChild(emptyIcon);
      emptyContainer.appendChild(emptyText);
      libraryGrid.appendChild(emptyContainer);
      return;
    }

    games.sort((a, b) => b.date - a.date);

    games.forEach((game) => {
      const card = document.createElement('div');
      card.className = 'game-card';

      const formattedDate = new Date(game.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });

      const topSection = document.createElement('div');

      if (game.coverUrl) {
        const coverWrapper = document.createElement('div');
        coverWrapper.className = 'game-card-cover-wrapper';
        const img = document.createElement('img');
        img.src = game.coverUrl;
        img.alt = game.name;
        img.className = 'game-card-cover';
        coverWrapper.appendChild(img);
        topSection.appendChild(coverWrapper);
      } else {
        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'game-card-icon-wrapper';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'currentColor');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute(
          'd',
          'M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H9v2H7v-2H5v-2h2V9h2v2h2v2zm4.5 1c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z'
        );
        svg.appendChild(path);
        iconWrapper.appendChild(svg);
        topSection.appendChild(iconWrapper);
      }

      const infoContainer = document.createElement('div');
      infoContainer.className = 'game-card-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'game-card-title';
      titleEl.title = game.name;
      titleEl.appendChild(document.createTextNode(game.name));

      if (game.isWasm4) {
        const badge = document.createElement('span');
        badge.className = 'badge-wasm4';
        badge.textContent = 'WASM-4 Cart';
        titleEl.appendChild(badge);
      } else if (game.isSingleHtml) {
        const badge = document.createElement('span');
        badge.className = 'badge-single-html';
        badge.textContent = 'Single HTML';
        titleEl.appendChild(badge);
      }

      const metaEl = document.createElement('div');
      metaEl.className = 'game-card-meta';
      metaEl.textContent = `${formatBytes(game.size)} • ${formattedDate}`;

      infoContainer.appendChild(titleEl);
      infoContainer.appendChild(metaEl);
      topSection.appendChild(infoContainer);

      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'game-card-actions';

      const playBtn = document.createElement('button');
      playBtn.className = 'btn-play';
      playBtn.setAttribute('data-id', game.id);
      playBtn.textContent = '▶ Play';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.setAttribute('data-id', game.id);
      deleteBtn.title = 'Delete Game';
      deleteBtn.textContent = '🗑';

      actionsContainer.appendChild(playBtn);
      actionsContainer.appendChild(deleteBtn);

      card.appendChild(topSection);
      card.appendChild(actionsContainer);

      libraryGrid.appendChild(card);
    });

    const playButtons = libraryGrid.querySelectorAll<HTMLButtonElement>('.btn-play');
    playButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;

        showProgressModal('Loading Game', 'Retrieving game from library...', 20);
        statusEl.textContent = 'Loading game from local library...';

        const game = await loadGameById(id);
        if (game) {
          try {
            if (game.isWasm4) {
              updateProgressModal('Preparing WASM-4 Cartridge...', 50);
              const wasmBytes = new Uint8Array(game.zipData);
              const htmlBytes = new TextEncoder().encode(generateWasm4Html());
              const normalizedMap: Record<string, Uint8Array> = {
                'cart.wasm': wasmBytes,
                'index.html': htmlBytes
              };

              currentFileMap = normalizedMap;
              currentEntryPath = 'index.html';
              activeGameName = game.name;

              updateProgressModal('Populating virtual cache...', 80);
              await loadGame(normalizedMap, 'index.html');
              hideProgressModal();
            } else if (game.isSingleHtml) {
              updateProgressModal('Preparing single HTML game...', 50);
              const uint8Array = new Uint8Array(game.zipData);
              const normalizedMap: Record<string, Uint8Array> = { 'index.html': uint8Array };

              currentFileMap = normalizedMap;
              currentEntryPath = 'index.html';
              activeGameName = game.name;

              updateProgressModal('Populating virtual cache...', 80);
              await loadGame(normalizedMap, 'index.html');

              updateProgressModal('Ready! Launching game...', 100);
              statusEl.textContent = `Playing ${game.name} from library.`;
            } else {
              updateProgressModal('Decompressing game files...', 50);
              const uint8Array = new Uint8Array(game.zipData);
              const unzipped = await unzipAsync(uint8Array);
              const { normalizedMap, entryPath } = processExtractedFiles(unzipped);

              currentFileMap = normalizedMap;
              currentEntryPath = entryPath;
              activeGameName = game.name;

              updateProgressModal('Populating virtual cache...', 80);
              await loadGame(normalizedMap, entryPath);

              updateProgressModal('Ready! Launching game...', 100);
              statusEl.textContent = `Playing ${game.name} from library.`;
            }
          } catch (err) {
            console.error('Failed to decompress saved game archive:', err);
            statusEl.textContent = 'Failed to decompress saved game.';
            showToast('Error decompressing saved game.');
          } finally {
            setTimeout(() => hideProgressModal(), 400);
          }
        } else {
          hideProgressModal();
          statusEl.textContent = 'Failed to find game in storage.';
          showToast('Game not found in local library.');
        }
      });
    });

    const deleteButtons = libraryGrid.querySelectorAll<HTMLButtonElement>('.btn-delete');
    deleteButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        await deleteGame(id);
        refreshGameLibrary();
        showToast('Game deleted from library.');
      });
    });

  } catch (err) {
    console.error('Failed to fetch saved games:', err);
  }
}

function handleFileSelect(file: File) {
  const name = file.name.toLowerCase();
  if (isWasm4File(name) || name.endsWith('.wasm')) {
    statusEl.textContent = `Reading ${file.name}...`;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        processWasmBuffer(e.target.result as ArrayBuffer, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    statusEl.textContent = `Reading ${file.name}...`;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        processHtmlBuffer(e.target.result as ArrayBuffer, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  if (name.endsWith('.zip')) {
    statusEl.textContent = `Reading ${file.name}...`;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        processZipBuffer(e.target.result as ArrayBuffer, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  statusEl.textContent = 'Please select a valid .zip, .html, or .wasm file.';
  showToast('Please select a valid .zip, .html, or .wasm file.');
}

// Drag & Drop
if (dropzone) {
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
}

if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      handleFileSelect(target.files[0]);
    }
  });
}

if (exitBtn) {
  exitBtn.addEventListener('click', () => {
    suspendGame();
  });
}

if (resumeGameBtn) {
  resumeGameBtn.addEventListener('click', () => {
    resumeGame();
  });
}

if (terminateGameBtn) {
  terminateGameBtn.addEventListener('click', () => {
    terminateGame();
  });
}

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

// --- Emulator Features: Pause, Fast-Forward, Aspect Ratio, CRT Filter ---

function togglePause() {
  isPaused = !isPaused;
  pauseBtn.classList.toggle('active', isPaused);
  pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';

  if (pauseOverlay) {
    pauseOverlay.classList.toggle('visible', isPaused);
  }

  try {
    const win = gameFrame.contentWindow as Window | null;
    if (win) {
      if (isPaused) {
        const audios = win.document.querySelectorAll('audio, video');
        audios.forEach((a) => (a as HTMLMediaElement).pause());
        if (!win.__runa_orig_raf) {
          win.__runa_orig_raf = win.requestAnimationFrame;
          win.requestAnimationFrame = () => 0;
        }
      } else {
        if (win.__runa_orig_raf) {
          win.requestAnimationFrame = win.__runa_orig_raf;
          delete win.__runa_orig_raf;
        }
        const audios = win.document.querySelectorAll('audio, video');
        audios.forEach((a) => (a as HTMLMediaElement).play().catch(() => {}));
      }
    }
  } catch (err) {
    console.warn('Iframe pause evaluation notice:', err);
  }
}

function toggleFastForward() {
  isFastForward = !isFastForward;
  fastForwardBtn.classList.toggle('active', isFastForward);
  fastForwardBtn.textContent = isFastForward ? '⏩ 2x' : '⏩ 1x';

  try {
    const win = gameFrame.contentWindow as Window | null;
    if (win) {
      const rate = isFastForward ? 2.0 : 1.0;
      const audios = win.document.querySelectorAll('audio, video');
      audios.forEach((a) => {
        (a as HTMLMediaElement).playbackRate = rate;
      });
      if (!win.__runa_raf_speed_set) {
        win.__runa_raf_speed_set = true;
        const origRaf = win.requestAnimationFrame.bind(win);
        win.requestAnimationFrame = (cb: FrameRequestCallback) => {
          return origRaf((time) => {
            cb(time * (win.__runa_speed_mult || 1));
          });
        };
      }
      win.__runa_speed_mult = rate;
    }
  } catch (err) {
    console.warn('Iframe fast-forward evaluation notice:', err);
  }
}

function cycleAspectRatio() {
  if (currentAspectRatio === 'fit') {
    currentAspectRatio = '4-3';
    aspectBtn.textContent = '📐 4:3';
  } else if (currentAspectRatio === '4-3') {
    currentAspectRatio = '16-9';
    aspectBtn.textContent = '📐 16:9';
  } else {
    currentAspectRatio = 'fit';
    aspectBtn.textContent = '📐 Fit';
  }

  if (gameWrapper) {
    gameWrapper.className = `aspect-${currentAspectRatio}`;
  }
}

function toggleCrtFilter() {
  isCrtEnabled = !isCrtEnabled;
  crtBtn.classList.toggle('active', isCrtEnabled);
  if (gameContainer) {
    gameContainer.classList.toggle('crt-filter', isCrtEnabled);
  }
}

if (pauseBtn) pauseBtn.addEventListener('click', togglePause);
if (fastForwardBtn) fastForwardBtn.addEventListener('click', toggleFastForward);
if (aspectBtn) aspectBtn.addEventListener('click', cycleAspectRatio);
if (crtBtn) crtBtn.addEventListener('click', toggleCrtFilter);

// --- Native Gamepad Manager Integration ---

const gamepadManager = new PhysicalGamepadManager({
  getIframeWindow: () => ({
    window: gameFrame.contentWindow,
    document: gameFrame.contentDocument
  }),
  onGamepadConnected: () => {
    virtualGamepad.classList.add('hidden');
    gamepadToggleBtn.classList.remove('active');
  },
  onGamepadDisconnected: () => {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      virtualGamepad.classList.remove('hidden');
      gamepadToggleBtn.classList.add('active');
    }
  },
  showToast
});

// --- Save State Manager System ---

function getIframeLocalStorage(): Record<string, string> {
  const storageData: Record<string, string> = {};
  try {
    const frameWindow = gameFrame.contentWindow;
    if (frameWindow && frameWindow.localStorage) {
      for (let i = 0; i < frameWindow.localStorage.length; i++) {
        const key = frameWindow.localStorage.key(i);
        if (key !== null && !isProtectedKey(key)) {
          storageData[key] = frameWindow.localStorage.getItem(key) || '';
        }
      }
    }
  } catch (err) {
    console.warn('Could not read iframe localStorage directly, falling back to top localStorage:', err);
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && !isProtectedKey(key) && !(key in storageData)) {
        storageData[key] = localStorage.getItem(key) || '';
      }
    }
  } catch (err) {
    console.warn('Could not read top localStorage:', err);
  }

  return storageData;
}

function setIframeLocalStorage(storageData: Record<string, string>) {
  try {
    const frameWindow = gameFrame.contentWindow;
    if (frameWindow && frameWindow.localStorage) {
      for (const [key, value] of Object.entries(storageData)) {
        if (!isProtectedKey(key)) {
          frameWindow.localStorage.setItem(key, value);
        }
      }
    }
  } catch (err) {
    console.warn('Could not write iframe localStorage directly:', err);
  }

  try {
    for (const [key, value] of Object.entries(storageData)) {
      if (!isProtectedKey(key)) {
        localStorage.setItem(key, value);
      }
    }
  } catch (err) {
    console.warn('Could not write top localStorage:', err);
  }
}

function setupSaveManager() {
  if (savesToggleBtn) {
    savesToggleBtn.addEventListener('click', () => {
      if (saveModal) {
        saveModal.classList.remove('hidden');
        if (saveModalStatus) saveModalStatus.textContent = '';
      }
    });
  }

  if (closeSaveModalBtn) {
    closeSaveModalBtn.addEventListener('click', () => {
      if (saveModal) saveModal.classList.add('hidden');
    });
  }

  if (saveModal) {
    saveModal.addEventListener('click', (e) => {
      if (e.target === saveModal) {
        saveModal.classList.add('hidden');
      }
    });
  }

  if (exportSaveBtn) {
    exportSaveBtn.addEventListener('click', () => {
      const storageKeys = getIframeLocalStorage();
      const savePayload = {
        game: activeGameName,
        timestamp: Date.now(),
        data: storageKeys
      };

      const jsonStr = JSON.stringify(savePayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const sanitizedGameName = activeGameName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const filename = `runaweb-${sanitizedGameName || 'game'}-save.json`;

      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = filename;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);

      if (saveModalStatus) {
        saveModalStatus.textContent = `Exported save for "${activeGameName}"!`;
      }
    });
  }

  if (importSaveBtn && importSaveInput) {
    importSaveBtn.addEventListener('click', () => {
      importSaveInput.click();
    });

    importSaveInput.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      if (!target.files || target.files.length === 0) return;

      const file = target.files[0];
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);

          const sanitizedData = validateSaveState(parsed);
          setIframeLocalStorage(sanitizedData);

          if (saveModalStatus) {
            saveModalStatus.textContent = 'Save state imported successfully! Reloading frame...';
          }

          setTimeout(() => {
            if (saveModal) saveModal.classList.add('hidden');
            if (currentFileMap) {
              loadGame(currentFileMap, currentEntryPath);
            } else if (gameFrame.src) {
              gameFrame.src = gameFrame.src;
            }
          }, 600);

        } catch (err) {
          console.error('Failed to parse save file:', err);
          if (saveModalStatus) {
            saveModalStatus.textContent = 'Error: Invalid JSON save file.';
          }
        }
      };

      reader.readAsText(file);
      importSaveInput.value = '';
    });
  }
}

// --- Touch Control / Virtual Gamepad Engine ---

interface KeyMapping {
  key: string;
  code: string;
  keyCode: number;
}

const touchEditor = setupTouchEditorModal({ showToast });

function dispatchKeyEvent(type: 'keydown' | 'keyup', mapping: KeyMapping) {
  unlockIframeAudio();
  try {
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
  } catch (err) {
    console.warn('Dispatch key event error:', err);
  }
}

function handleButtonPress(btnKey: string, type: 'keydown' | 'keyup') {
  unlockIframeAudio();
  const bindings = getKeybindings();
  const mappings = bindings[btnKey as InputAction];
  if (mappings && Array.isArray(mappings)) {
    mappings.forEach((m) => dispatchKeyEvent(type, m));
  }
}

function setupVirtualGamepad() {
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (virtualGamepad) {
    applyTouchLayoutToDOM(virtualGamepad);
    ['touchstart', 'pointerdown', 'mousedown', 'click'].forEach((evt) => {
      virtualGamepad.addEventListener(evt, () => unlockIframeAudio(), { passive: true });
    });
  }

  if (isTouchDevice && !gamepadManager.isConnected) {
    virtualGamepad.classList.remove('hidden');
    gamepadToggleBtn.classList.add('active');
  }

  gamepadToggleBtn.addEventListener('click', () => {
    const isHidden = virtualGamepad.classList.toggle('hidden');
    gamepadToggleBtn.classList.toggle('active', !isHidden);
  });

  const openTouchEditorBtn = document.getElementById('open-touch-editor-btn') as HTMLButtonElement;
  if (openTouchEditorBtn) {
    openTouchEditorBtn.addEventListener('click', () => {
      const controlsModal = document.getElementById('controls-modal');
      if (controlsModal) controlsModal.classList.add('hidden');
      if (!isPaused) {
        togglePause();
      }
      touchEditor.open();
    });
  }

  const buttons = virtualGamepad.querySelectorAll<HTMLButtonElement>('button');

  buttons.forEach((btn) => {
    const btnKey = btn.getAttribute('data-key') || btn.getAttribute('data-button');
    if (!btnKey) return;

    const handleStart = (e: Event) => {
      unlockIframeAudio();
      if (virtualGamepad.classList.contains('editing') || touchEditor.isEditing()) return;
      e.preventDefault();
      btn.classList.add('pressed');
      handleButtonPress(btnKey, 'keydown');
    };

    const handleEnd = (e: Event) => {
      if (virtualGamepad.classList.contains('editing') || touchEditor.isEditing()) return;
      e.preventDefault();
      btn.classList.remove('pressed');
      handleButtonPress(btnKey, 'keyup');
    };

    btn.addEventListener('touchstart', handleStart, { passive: false });
    btn.addEventListener('touchend', handleEnd, { passive: false });
    btn.addEventListener('touchcancel', handleEnd, { passive: false });

    btn.addEventListener('mousedown', (e) => {
      unlockIframeAudio();
      if (virtualGamepad.classList.contains('editing') || touchEditor.isEditing()) return;
      e.preventDefault();
      btn.classList.add('pressed');
      handleButtonPress(btnKey, 'keydown');
    });

    btn.addEventListener('mouseup', (e) => {
      if (virtualGamepad.classList.contains('editing') || touchEditor.isEditing()) return;
      e.preventDefault();
      btn.classList.remove('pressed');
      handleButtonPress(btnKey, 'keyup');
    });

    btn.addEventListener('mouseleave', (e) => {
      if (virtualGamepad.classList.contains('editing') || touchEditor.isEditing()) return;
      if (btn.classList.contains('pressed')) {
        e.preventDefault();
        btn.classList.remove('pressed');
        handleButtonPress(btnKey, 'keyup');
      }
    });
  });
}

registerServiceWorker();
configureIframeIsolation();
setupErudaDevTools();
setupHudControls();
setupSaveManager();
setupVirtualGamepad();
setupControlsModal({ showToast });

new VirtualKeyboardManager({
  getIframeWindow: () => ({
    window: gameFrame.contentWindow,
    document: gameFrame.contentDocument
  })
});
setupMessageIsolation();
refreshGameLibrary();

setViewMode('hub');
