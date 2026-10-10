import { unzipSync } from 'fflate';
import { saveGame, getSavedGames, loadGameById, deleteGame, SavedGame } from './storage';

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
let activeGameName: string = 'active_game';

const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const gameFrame = document.getElementById('game-frame') as HTMLIFrameElement;
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

// HUD Auto-Hide & Collapse State
let autoHideTimer: number | null = null;
let isHeaderPinned = false;
let currentMode: 'hub' | 'theater' = 'hub';

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

  // Hover or touch at top 30px edge reveals header temporarily
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

  // Clicking outside expanded header during gameplay collapses header
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

function setViewMode(mode: 'hub' | 'theater') {
  currentMode = mode;
  if (mode === 'theater') {
    document.body.classList.remove('mode-hub');
    document.body.classList.add('mode-theater');
    if (exitBtn) exitBtn.style.display = 'inline-flex';

    isHeaderPinned = false;
    expandHeader();
  } else {
    document.body.classList.remove('mode-theater');
    document.body.classList.add('mode-hub');
    if (exitBtn) exitBtn.style.display = 'none';

    if (autoHideTimer !== null) {
      window.clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    appHeader.classList.remove('hud-collapsed', 'hud-hidden');

    // Reset iframe when exiting to hub
    gameFrame.src = 'about:blank';
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
    // Normalize slashes and strip leading slashes
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
  return defaultName.replace(/\.zip$/i, '');
}

function processZipBuffer(arrayBuffer: ArrayBuffer, fileName: string) {
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
    const title = extractGameTitle(normalizedMap, entryPath, fileName);
    activeGameName = title;
    loadGame(normalizedMap, entryPath);

    // Save game to IndexedDB Library automatically
    const gameId = fileName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '_' + Date.now();
    const gameRecord: SavedGame = {
      id: gameId,
      name: title,
      date: Date.now(),
      zipData: arrayBuffer,
      size: arrayBuffer.byteLength
    };

    saveGame(gameRecord)
      .then(() => refreshGameLibrary())
      .catch((err) => console.error('Failed to save game to IndexedDB:', err));

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

  // Transition into Theater / Playing View
  setViewMode('theater');

  // Small delay to ensure SW stores files before iframe fetch
  setTimeout(() => {
    const cleanEntry = entryPath.replace(/^\/+/, '');
    gameFrame.src = baseUrl + 'virtual-game/' + cleanEntry;
    reloadBtn.disabled = false;
    fullscreenBtn.disabled = false;
  }, 100);
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
    libraryGrid.innerHTML = '';

    if (games.length === 0) {
      libraryGrid.innerHTML = `
        <div class="library-empty">
          <span class="library-empty-icon">👾</span>
          <p>Your arcade shelf is empty! Drop a game to start your collection.</p>
        </div>
      `;
      return;
    }

    // Sort newest first
    games.sort((a, b) => b.date - a.date);

    games.forEach((game) => {
      const card = document.createElement('div');
      card.className = 'game-card';

      const formattedDate = new Date(game.date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric'
      });

      card.innerHTML = `
        <div>
          <div class="game-card-icon-wrapper">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H9v2H7v-2H5v-2h2V9h2v2h2v2zm4.5 1c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5S17.67 9 18.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
          </div>
          <div class="game-card-info">
            <div class="game-card-title" title="${game.name}">${game.name}</div>
            <div class="game-card-meta">${formatBytes(game.size)} • ${formattedDate}</div>
          </div>
        </div>
        <div class="game-card-actions">
          <button class="btn-play" data-id="${game.id}">▶ Play</button>
          <button class="btn-delete" data-id="${game.id}" title="Delete Game">🗑</button>
        </div>
      `;

      libraryGrid.appendChild(card);
    });

    // Attach click event handlers
    const playButtons = libraryGrid.querySelectorAll<HTMLButtonElement>('.btn-play');
    playButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!id) return;
        statusEl.textContent = 'Loading game from local library...';
        const game = await loadGameById(id);
        if (game) {
          const uint8Array = new Uint8Array(game.zipData);
          const unzipped = unzipSync(uint8Array);
          const { normalizedMap, entryPath } = processExtractedFiles(unzipped);
          currentFileMap = normalizedMap;
          currentEntryPath = entryPath;
          activeGameName = game.name;
          loadGame(normalizedMap, entryPath);
          statusEl.textContent = `Playing ${game.name} from library.`;
        } else {
          statusEl.textContent = 'Failed to find game in storage.';
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
      });
    });

  } catch (err) {
    console.error('Failed to fetch saved games:', err);
  }
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
      processZipBuffer(e.target.result as ArrayBuffer, file.name);
    }
  };
  reader.readAsArrayBuffer(file);
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
    setViewMode('hub');
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

// --- Save State Manager System ---

function getIframeLocalStorage(): Record<string, string> {
  const storageData: Record<string, string> = {};
  try {
    const frameWindow = gameFrame.contentWindow;
    if (frameWindow && frameWindow.localStorage) {
      for (let i = 0; i < frameWindow.localStorage.length; i++) {
        const key = frameWindow.localStorage.key(i);
        if (key !== null) {
          storageData[key] = frameWindow.localStorage.getItem(key) || '';
        }
      }
    }
  } catch (err) {
    console.warn('Could not read iframe localStorage directly, falling back to top localStorage:', err);
  }

  // Fallback / complement with top localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && !(key in storageData)) {
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
      frameWindow.localStorage.clear();
      for (const [key, value] of Object.entries(storageData)) {
        frameWindow.localStorage.setItem(key, value);
      }
    }
  } catch (err) {
    console.warn('Could not write iframe localStorage directly:', err);
  }

  try {
    for (const [key, value] of Object.entries(storageData)) {
      localStorage.setItem(key, value);
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

  // Export Save Button
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

  // Import Save Button
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

          if (!parsed || typeof parsed !== 'object' || !parsed.data) {
            throw new Error('Invalid save file format.');
          }

          setIframeLocalStorage(parsed.data);

          if (saveModalStatus) {
            saveModalStatus.textContent = 'Save state imported successfully! Reloading frame...';
          }

          setTimeout(() => {
            if (saveModal) saveModal.classList.add('hidden');
            // Automatically reload game frame to pick up imported save data
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

    // Prevent default touch behaviors
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

// Initialize Service Worker, Eruda, Touch Gamepad, HUD, Save Manager, and Game Library
registerServiceWorker();
setupErudaDevTools();
setupHudControls();
setupSaveManager();
setupVirtualGamepad();
refreshGameLibrary();

// Default mode is hub
setViewMode('hub');
