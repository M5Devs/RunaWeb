/**
 * PPSSPP-Style In-Place Touch Controller Layout Editor Module for RunaWeb.
 * Provides free direct drag-and-drop repositioning across the active game screen,
 * scale slider, opacity slider, glyph-only mode toggle, and persistent localStorage saving.
 */

export const TOUCH_LAYOUT_STORAGE_KEY = 'runaweb_app_touch_layout';

export interface TouchElementConfig {
  x: number;       // percentage position (0 - 100)
  y: number;       // percentage position (0 - 100)
  scale: number;   // 0.6x to 1.8x
  opacity: number; // 0.1 to 1.0 (10% to 100%)
  visible: boolean;
  glyphOnly: boolean; // removes background box/circle if true
}

export type TouchControlKey =
  | 'dpad'
  | 'select'
  | 'start'
  | 'actionY'
  | 'actionX'
  | 'actionB'
  | 'actionA';

export type TouchLayoutConfig = Record<TouchControlKey, TouchElementConfig>;

export const CONTROL_LABELS: Record<TouchControlKey, string> = {
  dpad: 'D-Pad',
  select: 'Select',
  start: 'Start',
  actionY: 'Button Y',
  actionX: 'Button X',
  actionB: 'Button B',
  actionA: 'Button A'
};

export const DEFAULT_TOUCH_LAYOUT: TouchLayoutConfig = {
  dpad: { x: 5, y: 65, scale: 1.0, opacity: 1.0, visible: true, glyphOnly: false },
  select: { x: 38, y: 80, scale: 1.0, opacity: 1.0, visible: true, glyphOnly: false },
  start: { x: 52, y: 80, scale: 1.0, opacity: 1.0, visible: true, glyphOnly: false },
  actionY: { x: 78, y: 58, scale: 1.0, opacity: 1.0, visible: true, glyphOnly: false },
  actionX: { x: 70, y: 68, scale: 1.0, opacity: 1.0, visible: true, glyphOnly: false },
  actionB: { x: 86, y: 68, scale: 1.0, opacity: 1.0, visible: true, glyphOnly: false },
  actionA: { x: 78, y: 78, scale: 1.0, opacity: 1.0, visible: true, glyphOnly: false }
};

export function getDefaultTouchLayout(): TouchLayoutConfig {
  return JSON.parse(JSON.stringify(DEFAULT_TOUCH_LAYOUT));
}

export function getTouchLayout(): TouchLayoutConfig {
  try {
    if (typeof localStorage === 'undefined') return getDefaultTouchLayout();
    const stored = localStorage.getItem(TOUCH_LAYOUT_STORAGE_KEY);
    if (!stored) return getDefaultTouchLayout();
    const parsed = JSON.parse(stored);
    const defaults = getDefaultTouchLayout();

    for (const key in defaults) {
      const ctrlKey = key as TouchControlKey;
      if (!parsed[ctrlKey] || typeof parsed[ctrlKey] !== 'object') {
        parsed[ctrlKey] = defaults[ctrlKey];
      } else {
        parsed[ctrlKey].x = typeof parsed[ctrlKey].x === 'number' ? parsed[ctrlKey].x : defaults[ctrlKey].x;
        parsed[ctrlKey].y = typeof parsed[ctrlKey].y === 'number' ? parsed[ctrlKey].y : defaults[ctrlKey].y;
        parsed[ctrlKey].scale = typeof parsed[ctrlKey].scale === 'number' ? Math.max(0.6, Math.min(1.8, parsed[ctrlKey].scale)) : defaults[ctrlKey].scale;
        parsed[ctrlKey].opacity = typeof parsed[ctrlKey].opacity === 'number' ? Math.max(0.1, Math.min(1.0, parsed[ctrlKey].opacity)) : defaults[ctrlKey].opacity;
        parsed[ctrlKey].visible = typeof parsed[ctrlKey].visible === 'boolean' ? parsed[ctrlKey].visible : defaults[ctrlKey].visible;
        parsed[ctrlKey].glyphOnly = typeof parsed[ctrlKey].glyphOnly === 'boolean' ? parsed[ctrlKey].glyphOnly : defaults[ctrlKey].glyphOnly;
      }
    }
    return parsed;
  } catch (err) {
    console.warn('Failed to parse touch layout from localStorage, falling back to defaults:', err);
    return getDefaultTouchLayout();
  }
}

export function saveTouchLayout(layout: TouchLayoutConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOUCH_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    }
  } catch (err) {
    console.warn('Failed to save touch layout to localStorage:', err);
  }
}

export function resetTouchLayout(): TouchLayoutConfig {
  const defaults = getDefaultTouchLayout();
  saveTouchLayout(defaults);
  return defaults;
}

export function getControlElementMap(gamepadContainer: HTMLElement): Partial<Record<TouchControlKey, HTMLElement>> {
  const map: Partial<Record<TouchControlKey, HTMLElement>> = {};

  const dpad = gamepadContainer.querySelector('.dpad-container') as HTMLElement;
  if (dpad) map.dpad = dpad;

  const select = gamepadContainer.querySelector('button[data-button="SELECT"]') as HTMLElement;
  if (select) map.select = select;

  const start = gamepadContainer.querySelector('button[data-button="START"]') as HTMLElement;
  if (start) map.start = start;

  const actionY = gamepadContainer.querySelector('button[data-button="Y"]') as HTMLElement;
  if (actionY) map.actionY = actionY;

  const actionX = gamepadContainer.querySelector('button[data-button="X"]') as HTMLElement;
  if (actionX) map.actionX = actionX;

  const actionB = gamepadContainer.querySelector('button[data-button="B"]') as HTMLElement;
  if (actionB) map.actionB = actionB;

  const actionA = gamepadContainer.querySelector('button[data-button="A"]') as HTMLElement;
  if (actionA) map.actionA = actionA;

  return map;
}

export function applyTouchLayoutToDOM(gamepadContainer: HTMLElement, layout?: TouchLayoutConfig): void {
  if (!gamepadContainer) return;
  const cfg = layout || getTouchLayout();
  const elementMap = getControlElementMap(gamepadContainer);

  (Object.keys(cfg) as TouchControlKey[]).forEach((key) => {
    const el = elementMap[key];
    const itemCfg = cfg[key];
    if (el && itemCfg) {
      el.style.position = 'absolute';
      el.style.left = `${itemCfg.x}%`;
      el.style.top = `${itemCfg.y}%`;
      el.style.transform = `scale(${itemCfg.scale})`;
      el.style.opacity = `${itemCfg.opacity}`;
      el.style.display = itemCfg.visible ? 'flex' : 'none';

      if (itemCfg.glyphOnly) {
        el.classList.add('glyph-only');
      } else {
        el.classList.remove('glyph-only');
      }
    }
  });
}

export interface TouchEditorOptions {
  showToast?: (message: string) => void;
  onLayoutSaved?: () => void;
  getGamepadContainer?: () => HTMLElement | null;
}

export function setupTouchEditorModal(options: TouchEditorOptions = {}) {
  let toolbar = document.getElementById('touch-editor-toolbar') as HTMLDivElement;

  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.id = 'touch-editor-toolbar';
    toolbar.className = 'hidden';
    toolbar.innerHTML = `
      <div class="toolbar-group">
        <span id="editor-selected-label" class="toolbar-label">Selected: D-Pad</span>
      </div>
      <div class="toolbar-group">
        <label class="slider-label">Scale: <span id="editor-scale-val">1.00x</span></label>
        <input type="range" id="editor-scale-slider" min="0.6" max="1.8" step="0.05" value="1.0" class="editor-slider" />
      </div>
      <div class="toolbar-group">
        <label class="slider-label">Opacity: <span id="editor-opacity-val">100%</span></label>
        <input type="range" id="editor-opacity-slider" min="10" max="100" step="5" value="100" class="editor-slider" />
      </div>
      <div class="toolbar-group toolbar-toggles">
        <label class="toggle-btn-label">
          <input type="checkbox" id="editor-glyph-toggle" />
          <span>Glyph Only</span>
        </label>
      </div>
      <div class="toolbar-actions">
        <button id="editor-reset-btn" class="btn btn-secondary">🔄 Reset</button>
        <button id="editor-save-btn" class="btn btn-primary">💾 Save Layout</button>
      </div>
    `;
    document.body.appendChild(toolbar);
  }

  const selectedLabel = toolbar.querySelector('#editor-selected-label') as HTMLSpanElement;
  const scaleSlider = toolbar.querySelector('#editor-scale-slider') as HTMLInputElement;
  const scaleVal = toolbar.querySelector('#editor-scale-val') as HTMLSpanElement;
  const opacitySlider = toolbar.querySelector('#editor-opacity-slider') as HTMLInputElement;
  const opacityVal = toolbar.querySelector('#editor-opacity-val') as HTMLSpanElement;
  const glyphToggle = toolbar.querySelector('#editor-glyph-toggle') as HTMLInputElement;
  const resetBtn = toolbar.querySelector('#editor-reset-btn') as HTMLButtonElement;
  const saveBtn = toolbar.querySelector('#editor-save-btn') as HTMLButtonElement;

  let isEditingMode = false;
  let currentLayout: TouchLayoutConfig = getTouchLayout();
  let selectedKey: TouchControlKey = 'dpad';
  let activeDragKey: TouchControlKey | null = null;
  let dragOffset = { x: 0, y: 0 };

  function getGamepadEl(): HTMLElement | null {
    if (options.getGamepadContainer) return options.getGamepadContainer();
    return document.getElementById('virtual-gamepad');
  }

  function updateToolbarUI() {
    const cfg = currentLayout[selectedKey];
    if (!cfg) return;

    if (selectedLabel) selectedLabel.textContent = `Selected: ${CONTROL_LABELS[selectedKey]}`;
    if (scaleSlider) scaleSlider.value = cfg.scale.toString();
    if (scaleVal) scaleVal.textContent = `${cfg.scale.toFixed(2)}x`;
    if (opacitySlider) opacitySlider.value = Math.round(cfg.opacity * 100).toString();
    if (opacityVal) opacityVal.textContent = `${Math.round(cfg.opacity * 100)}%`;
    if (glyphToggle) glyphToggle.checked = cfg.glyphOnly;
  }

  function updateSelectedHighlight() {
    const gamepad = getGamepadEl();
    if (!gamepad) return;
    const elementMap = getControlElementMap(gamepad);

    (Object.keys(CONTROL_LABELS) as TouchControlKey[]).forEach((key) => {
      const el = elementMap[key];
      if (el) {
        if (isEditingMode && key === selectedKey) {
          el.classList.add('touch-editing-selected');
        } else {
          el.classList.remove('touch-editing-selected');
        }
      }
    });
  }

  function selectControl(key: TouchControlKey) {
    selectedKey = key;
    updateToolbarUI();
    updateSelectedHighlight();
  }

  function attachDragListeners() {
    const gamepad = getGamepadEl();
    if (!gamepad) return;
    const elementMap = getControlElementMap(gamepad);

    (Object.keys(elementMap) as TouchControlKey[]).forEach((key) => {
      const el = elementMap[key];
      if (!el) return;

      const handlePointerDown = (e: MouseEvent | TouchEvent) => {
        if (!isEditingMode) return;
        e.preventDefault();
        e.stopPropagation();

        selectControl(key);
        activeDragKey = key;

        const rect = gamepad.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const currentX = (currentLayout[key].x / 100) * rect.width;
        const currentY = (currentLayout[key].y / 100) * rect.height;

        dragOffset.x = clientX - rect.left - currentX;
        dragOffset.y = clientY - rect.top - currentY;

        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('touchmove', onDragMove, { passive: false });
        window.addEventListener('mouseup', onDragEnd);
        window.addEventListener('touchend', onDragEnd);
      };

      el.addEventListener('mousedown', handlePointerDown);
      el.addEventListener('touchstart', handlePointerDown, { passive: false });
    });
  }

  function onDragMove(e: MouseEvent | TouchEvent) {
    if (!isEditingMode || !activeDragKey) return;
    if ('touches' in e) e.preventDefault();

    const gamepad = getGamepadEl();
    if (!gamepad) return;

    const rect = gamepad.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    let posX = clientX - rect.left - dragOffset.x;
    let posY = clientY - rect.top - dragOffset.y;

    let pctX = Math.max(0, Math.min(90, (posX / rect.width) * 100));
    let pctY = Math.max(0, Math.min(90, (posY / rect.height) * 100));

    currentLayout[activeDragKey].x = Math.round(pctX);
    currentLayout[activeDragKey].y = Math.round(pctY);

    applyTouchLayoutToDOM(gamepad, currentLayout);
    updateSelectedHighlight();
  }

  function onDragEnd() {
    activeDragKey = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('touchmove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    window.removeEventListener('touchend', onDragEnd);
  }

  if (scaleSlider) {
    scaleSlider.addEventListener('input', () => {
      const val = parseFloat(scaleSlider.value);
      currentLayout[selectedKey].scale = val;
      if (scaleVal) scaleVal.textContent = `${val.toFixed(2)}x`;
      const gamepad = getGamepadEl();
      if (gamepad) applyTouchLayoutToDOM(gamepad, currentLayout);
    });
  }

  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      const val = parseInt(opacitySlider.value, 10);
      currentLayout[selectedKey].opacity = val / 100;
      if (opacityVal) opacityVal.textContent = `${val}%`;
      const gamepad = getGamepadEl();
      if (gamepad) applyTouchLayoutToDOM(gamepad, currentLayout);
    });
  }

  if (glyphToggle) {
    glyphToggle.addEventListener('change', () => {
      currentLayout[selectedKey].glyphOnly = glyphToggle.checked;
      const gamepad = getGamepadEl();
      if (gamepad) applyTouchLayoutToDOM(gamepad, currentLayout);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentLayout = resetTouchLayout();
      const gamepad = getGamepadEl();
      if (gamepad) applyTouchLayoutToDOM(gamepad, currentLayout);
      updateToolbarUI();
      updateSelectedHighlight();
      if (options.showToast) options.showToast('Touch layout reset to defaults.');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveTouchLayout(currentLayout);
      const gamepad = getGamepadEl();
      if (gamepad) applyTouchLayoutToDOM(gamepad, currentLayout);

      close();

      if (options.showToast) options.showToast('Saved touch layout changes.');
      if (options.onLayoutSaved) options.onLayoutSaved();
    });
  }

  function open() {
    isEditingMode = true;
    currentLayout = getTouchLayout();
    const gamepad = getGamepadEl();
    if (gamepad) {
      gamepad.classList.remove('hidden');
      gamepad.classList.add('editing');
      applyTouchLayoutToDOM(gamepad, currentLayout);
    }
    toolbar.classList.remove('hidden');
    attachDragListeners();
    selectControl('dpad');
  }

  function close() {
    isEditingMode = false;
    toolbar.classList.add('hidden');
    const gamepad = getGamepadEl();
    if (gamepad) {
      gamepad.classList.remove('editing');
      updateSelectedHighlight();
      applyTouchLayoutToDOM(gamepad, getTouchLayout());
    }
  }

  return {
    open,
    close,
    isEditing: () => isEditingMode
  };
}
