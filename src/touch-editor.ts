/**
 * PPSSPP-Style Touch Controller Layout Editor Module for RunaWeb.
 * Provides free drag-and-drop repositioning, scale, opacity, glyph-only mode,
 * visibility toggles, and persistent localStorage saving under 'runaweb_app_touch_layout'.
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

  // Apply custom layout styling to individual controls
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
}

export function setupTouchEditorModal(options: TouchEditorOptions = {}) {
  let modal = document.getElementById('touch-editor-modal') as HTMLDivElement;

  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'touch-editor-modal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = `
      <div class="touch-editor-card">
        <div class="touch-editor-header">
          <div class="touch-editor-title">
            <span>✏️</span> Touch Controller Layout Editor
          </div>
          <button id="close-touch-editor" class="btn-modal-close" title="Close">✕</button>
        </div>

        <div class="touch-editor-toolbar">
          <div class="toolbar-group">
            <span id="selected-control-label" class="toolbar-label">Select a button below</span>
          </div>

          <div class="toolbar-group">
            <label class="slider-label">Scale: <span id="scale-value">1.0x</span></label>
            <input type="range" id="scale-slider" min="0.6" max="1.8" step="0.05" value="1.0" class="editor-slider" />
          </div>

          <div class="toolbar-group">
            <label class="slider-label">Opacity: <span id="opacity-value">100%</span></label>
            <input type="range" id="opacity-slider" min="10" max="100" step="5" value="100" class="editor-slider" />
          </div>

          <div class="toolbar-group toolbar-toggles">
            <label class="toggle-btn-label">
              <input type="checkbox" id="glyph-toggle" />
              <span>Glyph Only</span>
            </label>
            <label class="toggle-btn-label">
              <input type="checkbox" id="visible-toggle" checked />
              <span>Visible</span>
            </label>
          </div>

          <div class="toolbar-actions">
            <button id="reset-touch-layout-btn" class="btn btn-secondary">🔄 Reset</button>
            <button id="save-touch-layout-btn" class="btn btn-primary">💾 Save Layout</button>
          </div>
        </div>

        <div id="touch-editor-canvas" class="touch-editor-canvas"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const canvas = modal.querySelector('#touch-editor-canvas') as HTMLDivElement;
  const selectedLabel = modal.querySelector('#selected-control-label') as HTMLSpanElement;
  const scaleSlider = modal.querySelector('#scale-slider') as HTMLInputElement;
  const scaleValue = modal.querySelector('#scale-value') as HTMLSpanElement;
  const opacitySlider = modal.querySelector('#opacity-slider') as HTMLInputElement;
  const opacityValue = modal.querySelector('#opacity-value') as HTMLSpanElement;
  const glyphToggle = modal.querySelector('#glyph-toggle') as HTMLInputElement;
  const visibleToggle = modal.querySelector('#visible-toggle') as HTMLInputElement;
  const closeBtn = modal.querySelector('#close-touch-editor') as HTMLButtonElement;
  const resetBtn = modal.querySelector('#reset-touch-layout-btn') as HTMLButtonElement;
  const saveBtn = modal.querySelector('#save-touch-layout-btn') as HTMLButtonElement;

  let currentLayout: TouchLayoutConfig = getTouchLayout();
  let selectedKey: TouchControlKey = 'dpad';
  let activeDragKey: TouchControlKey | null = null;
  let dragOffset = { x: 0, y: 0 };

  function renderCanvas() {
    if (!canvas) return;
    canvas.innerHTML = '';

    (Object.keys(currentLayout) as TouchControlKey[]).forEach((key) => {
      const cfg = currentLayout[key];
      const target = document.createElement('div');
      target.className = `editor-target editor-target-${key}`;
      if (selectedKey === key) target.classList.add('selected');
      if (cfg.glyphOnly) target.classList.add('glyph-only');
      if (!cfg.visible) target.classList.add('hidden-target');

      target.style.left = `${cfg.x}%`;
      target.style.top = `${cfg.y}%`;
      target.style.transform = `scale(${cfg.scale})`;
      target.style.opacity = `${cfg.opacity}`;

      let innerHTML = '';
      if (key === 'dpad') {
        innerHTML = `<div class="editor-dpad"><span>▲</span><div><span>◀</span><span>▶</span></div><span>▼</span></div>`;
      } else if (key === 'select') {
        innerHTML = `<span class="editor-btn-text">SELECT</span>`;
      } else if (key === 'start') {
        innerHTML = `<span class="editor-btn-text">START</span>`;
      } else {
        const letter = key.replace('action', '');
        innerHTML = `<span class="editor-btn-text">${letter}</span>`;
      }

      target.innerHTML = innerHTML;

      target.addEventListener('mousedown', (e) => startDrag(e, key));
      target.addEventListener('touchstart', (e) => startDrag(e, key), { passive: false });

      canvas.appendChild(target);
    });

    updateToolbarForSelected();
  }

  function selectControl(key: TouchControlKey) {
    selectedKey = key;
    renderCanvas();
  }

  function updateToolbarForSelected() {
    const cfg = currentLayout[selectedKey];
    if (!cfg) return;

    if (selectedLabel) selectedLabel.textContent = `Selected: ${CONTROL_LABELS[selectedKey]}`;
    if (scaleSlider) scaleSlider.value = cfg.scale.toString();
    if (scaleValue) scaleValue.textContent = `${cfg.scale.toFixed(2)}x`;
    if (opacitySlider) opacitySlider.value = Math.round(cfg.opacity * 100).toString();
    if (opacityValue) opacityValue.textContent = `${Math.round(cfg.opacity * 100)}%`;
    if (glyphToggle) glyphToggle.checked = cfg.glyphOnly;
    if (visibleToggle) visibleToggle.checked = cfg.visible;
  }

  function startDrag(e: MouseEvent | TouchEvent, key: TouchControlKey) {
    e.preventDefault();
    selectControl(key);
    activeDragKey = key;

    const rect = canvas.getBoundingClientRect();
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
  }

  function onDragMove(e: MouseEvent | TouchEvent) {
    if (!activeDragKey || !canvas) return;
    if ('touches' in e) e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    let posX = clientX - rect.left - dragOffset.x;
    let posY = clientY - rect.top - dragOffset.y;

    let pctX = (posX / rect.width) * 100;
    let pctY = (posY / rect.height) * 100;

    pctX = Math.max(0, Math.min(90, pctX));
    pctY = Math.max(0, Math.min(90, pctY));

    currentLayout[activeDragKey].x = Math.round(pctX);
    currentLayout[activeDragKey].y = Math.round(pctY);

    const targetEl = canvas.querySelector(`.editor-target-${activeDragKey}`) as HTMLElement;
    if (targetEl) {
      targetEl.style.left = `${currentLayout[activeDragKey].x}%`;
      targetEl.style.top = `${currentLayout[activeDragKey].y}%`;
    }
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
      if (scaleValue) scaleValue.textContent = `${val.toFixed(2)}x`;
      renderCanvas();
    });
  }

  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      const val = parseInt(opacitySlider.value, 10);
      currentLayout[selectedKey].opacity = val / 100;
      if (opacityValue) opacityValue.textContent = `${val}%`;
      renderCanvas();
    });
  }

  if (glyphToggle) {
    glyphToggle.addEventListener('change', () => {
      currentLayout[selectedKey].glyphOnly = glyphToggle.checked;
      renderCanvas();
    });
  }

  if (visibleToggle) {
    visibleToggle.addEventListener('change', () => {
      currentLayout[selectedKey].visible = visibleToggle.checked;
      renderCanvas();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      currentLayout = getDefaultTouchLayout();
      renderCanvas();
      if (options.showToast) options.showToast('Touch layout reset to defaults.');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveTouchLayout(currentLayout);
      const virtualGamepad = document.getElementById('virtual-gamepad');
      if (virtualGamepad) {
        applyTouchLayoutToDOM(virtualGamepad, currentLayout);
      }
      modal.classList.add('hidden');
      if (options.showToast) options.showToast('Saved touch layout changes.');
      if (options.onLayoutSaved) options.onLayoutSaved();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
    }
  });

  return {
    open() {
      currentLayout = getTouchLayout();
      modal.classList.remove('hidden');
      renderCanvas();
    },
    close() {
      modal.classList.add('hidden');
    }
  };
}
