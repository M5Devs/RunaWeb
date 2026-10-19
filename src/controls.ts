/**
 * Custom Key Mapping & Control Remapper Module for RunaWeb.
 * Persistent keybinding storage under 'runaweb_app_keybindings'.
 */

export interface KeyMapping {
  key: string;
  code: string;
  keyCode: number;
}

export type InputAction =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'A'
  | 'B'
  | 'X'
  | 'Y'
  | 'SELECT'
  | 'START';

export const KEYBINDINGS_STORAGE_KEY = 'runaweb_app_keybindings';

export const DEFAULT_KEYBINDINGS: Record<InputAction, KeyMapping[]> = {
  ArrowUp: [
    { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    { key: 'w', code: 'KeyW', keyCode: 87 }
  ],
  ArrowDown: [
    { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    { key: 's', code: 'KeyS', keyCode: 83 }
  ],
  ArrowLeft: [
    { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    { key: 'a', code: 'KeyA', keyCode: 65 }
  ],
  ArrowRight: [
    { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    { key: 'd', code: 'KeyD', keyCode: 68 }
  ],
  A: [
    { key: ' ', code: 'Space', keyCode: 32 }
  ],
  B: [
    { key: 'z', code: 'KeyZ', keyCode: 90 },
    { key: 'Escape', code: 'Escape', keyCode: 27 }
  ],
  X: [
    { key: 'x', code: 'KeyX', keyCode: 88 }
  ],
  Y: [
    { key: 'c', code: 'KeyC', keyCode: 67 },
    { key: 'Enter', code: 'Enter', keyCode: 13 }
  ],
  SELECT: [
    { key: 'Tab', code: 'Tab', keyCode: 9 },
    { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }
  ],
  START: [
    { key: 'Enter', code: 'Enter', keyCode: 13 },
    { key: 'p', code: 'KeyP', keyCode: 80 }
  ]
};

export const ACTION_LABELS: Record<InputAction, string> = {
  ArrowUp: 'D-Pad Up',
  ArrowDown: 'D-Pad Down',
  ArrowLeft: 'D-Pad Left',
  ArrowRight: 'D-Pad Right',
  A: 'Action A',
  B: 'Action B',
  X: 'Action X',
  Y: 'Action Y',
  SELECT: 'Select',
  START: 'Start'
};

export function getDefaultKeybindings(): Record<InputAction, KeyMapping[]> {
  return JSON.parse(JSON.stringify(DEFAULT_KEYBINDINGS));
}

export function getKeybindings(): Record<InputAction, KeyMapping[]> {
  try {
    if (typeof localStorage === "undefined") return getDefaultKeybindings();
    const stored = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
    if (!stored) return getDefaultKeybindings();
    const parsed = JSON.parse(stored);
    const defaults = getDefaultKeybindings();
    for (const action in defaults) {
      if (!parsed[action] || !Array.isArray(parsed[action]) || parsed[action].length === 0) {
        parsed[action] = defaults[action as InputAction];
      }
    }
    return parsed;
  } catch (err) {
    console.warn('Failed to parse custom keybindings, falling back to defaults:', err);
    return getDefaultKeybindings();
  }
}

export function saveKeybindings(bindings: Record<InputAction, KeyMapping[]>): void {
  try {
    if (typeof localStorage !== "undefined") { localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(bindings)); }
  } catch (err) {
    console.warn('Failed to save keybindings to localStorage:', err);
  }
}

export function resetKeybindings(): Record<InputAction, KeyMapping[]> {
  const defaults = getDefaultKeybindings();
  saveKeybindings(defaults);
  return defaults;
}

export interface ControlsModalOptions {
  onBindingsUpdated?: () => void;
  showToast?: (message: string) => void;
}

export function setupControlsModal(options: ControlsModalOptions = {}) {
  const modal = document.getElementById('controls-modal') as HTMLDivElement;
  const closeBtn = document.getElementById('close-controls-modal') as HTMLButtonElement;
  const toggleBtn = document.getElementById('controls-toggle-btn') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-controls-btn') as HTMLButtonElement;
  const gridContainer = document.getElementById('controls-grid') as HTMLDivElement;

  if (!modal || !gridContainer) return;

  let listeningAction: InputAction | null = null;
  let keyListener: ((e: KeyboardEvent) => void) | null = null;

  function renderGrid() {
    if (!gridContainer) return;
    gridContainer.innerHTML = '';
    const bindings = getKeybindings();

    const actions = Object.keys(DEFAULT_KEYBINDINGS) as InputAction[];
    actions.forEach((action) => {
      const row = document.createElement('div');
      row.className = 'control-row';

      const label = document.createElement('span');
      label.className = 'control-label';
      label.textContent = ACTION_LABELS[action] || action;

      const bindBtn = document.createElement('button');
      bindBtn.className = 'key-bind-btn';

      if (listeningAction === action) {
        bindBtn.classList.add('listening');
        bindBtn.textContent = 'Press any key...';
      } else {
        const primaryCode = bindings[action]?.[0]?.code || 'Unbound';
        bindBtn.textContent = primaryCode;
      }

      bindBtn.addEventListener('click', () => {
        if (listeningAction === action) {
          stopListening();
          renderGrid();
          return;
        }

        startListening(action);
      });

      row.appendChild(label);
      row.appendChild(bindBtn);
      gridContainer.appendChild(row);
    });
  }

  function startListening(action: InputAction) {
    stopListening();
    listeningAction = action;
    renderGrid();

    keyListener = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignore standard modifier keys when pressed alone
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
        return;
      }

      const bindings = getKeybindings();
      const newMapping: KeyMapping = {
        code: e.code,
        key: e.key,
        keyCode: e.keyCode || e.which || 0
      };

      bindings[action] = [newMapping];
      saveKeybindings(bindings);

      stopListening();
      renderGrid();

      if (options.onBindingsUpdated) {
        options.onBindingsUpdated();
      }

      if (options.showToast) {
        options.showToast(`Rebound ${ACTION_LABELS[action]} to ${e.code}`);
      }
    };

    window.addEventListener('keydown', keyListener, { capture: true, once: true });
  }

  function stopListening() {
    if (keyListener) {
      window.removeEventListener('keydown', keyListener, { capture: true });
      keyListener = null;
    }
    listeningAction = null;
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
      renderGrid();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      stopListening();
      modal.classList.add('hidden');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      stopListening();
      modal.classList.add('hidden');
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      stopListening();
      resetKeybindings();
      renderGrid();
      if (options.onBindingsUpdated) {
        options.onBindingsUpdated();
      }
      if (options.showToast) {
        options.showToast('Reset keybindings to default.');
      }
    });
  }
}
