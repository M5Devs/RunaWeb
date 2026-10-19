/**
 * Full PC & Compact Gaming Keyboard Module for RunaWeb.
 * Provides a gaming-grade, translucent touch keyboard with Function Keys (F1-F12),
 * Arrow Keys, Modifiers (Ctrl, Alt, Shift, Tab, Caps Lock), Sticky Combo Modifiers,
 * and authentic KeyboardEvent dispatching.
 */

export interface VirtualKeyDef {
  label: string;
  key: string;
  code: string;
  keyCode: number;
  className?: string;
  modifierType?: 'shift' | 'ctrl' | 'alt' | 'caps';
}

export const PC_KEYBOARD_ROWS: VirtualKeyDef[][] = [
  // Row 0: Function Keys & Esc / Del
  [
    { label: 'Esc', key: 'Escape', code: 'Escape', keyCode: 27, className: 'vkey-fn vkey-special' },
    { label: 'F1', key: 'F1', code: 'F1', keyCode: 112, className: 'vkey-fn' },
    { label: 'F2', key: 'F2', code: 'F2', keyCode: 113, className: 'vkey-fn' },
    { label: 'F3', key: 'F3', code: 'F3', keyCode: 114, className: 'vkey-fn' },
    { label: 'F4', key: 'F4', code: 'F4', keyCode: 115, className: 'vkey-fn' },
    { label: 'F5', key: 'F5', code: 'F5', keyCode: 116, className: 'vkey-fn' },
    { label: 'F6', key: 'F6', code: 'F6', keyCode: 117, className: 'vkey-fn' },
    { label: 'F7', key: 'F7', code: 'F7', keyCode: 118, className: 'vkey-fn' },
    { label: 'F8', key: 'F8', code: 'F8', keyCode: 119, className: 'vkey-fn' },
    { label: 'F9', key: 'F9', code: 'F9', keyCode: 120, className: 'vkey-fn' },
    { label: 'F10', key: 'F10', code: 'F10', keyCode: 121, className: 'vkey-fn' },
    { label: 'F11', key: 'F11', code: 'F11', keyCode: 122, className: 'vkey-fn' },
    { label: 'F12', key: 'F12', code: 'F12', keyCode: 123, className: 'vkey-fn' },
    { label: 'Del', key: 'Delete', code: 'Delete', keyCode: 46, className: 'vkey-fn vkey-special' }
  ],
  // Row 1: Numbers & Symbols
  [
    { label: '`', key: '`', code: 'Backquote', keyCode: 192 },
    { label: '1', key: '1', code: 'Digit1', keyCode: 49 },
    { label: '2', key: '2', code: 'Digit2', keyCode: 50 },
    { label: '3', key: '3', code: 'Digit3', keyCode: 51 },
    { label: '4', key: '4', code: 'Digit4', keyCode: 52 },
    { label: '5', key: '5', code: 'Digit5', keyCode: 53 },
    { label: '6', key: '6', code: 'Digit6', keyCode: 54 },
    { label: '7', key: '7', code: 'Digit7', keyCode: 55 },
    { label: '8', key: '8', code: 'Digit8', keyCode: 56 },
    { label: '9', key: '9', code: 'Digit9', keyCode: 57 },
    { label: '0', key: '0', code: 'Digit0', keyCode: 48 },
    { label: '-', key: '-', code: 'Minus', keyCode: 189 },
    { label: '=', key: '=', code: 'Equal', keyCode: 187 },
    { label: '⌫', key: 'Backspace', code: 'Backspace', keyCode: 8, className: 'vkey-wide vkey-special' }
  ],
  // Row 2: Tab & QWERTY Top Row
  [
    { label: 'Tab', key: 'Tab', code: 'Tab', keyCode: 9, className: 'vkey-wide vkey-special' },
    { label: 'q', key: 'q', code: 'KeyQ', keyCode: 81 },
    { label: 'w', key: 'w', code: 'KeyW', keyCode: 87 },
    { label: 'e', key: 'e', code: 'KeyE', keyCode: 69 },
    { label: 'r', key: 'r', code: 'KeyR', keyCode: 82 },
    { label: 't', key: 't', code: 'KeyT', keyCode: 84 },
    { label: 'y', key: 'y', code: 'KeyY', keyCode: 89 },
    { label: 'u', key: 'u', code: 'KeyU', keyCode: 85 },
    { label: 'i', key: 'i', code: 'KeyI', keyCode: 73 },
    { label: 'o', key: 'o', code: 'KeyO', keyCode: 79 },
    { label: 'p', key: 'p', code: 'KeyP', keyCode: 80 },
    { label: '[', key: '[', code: 'BracketLeft', keyCode: 219 },
    { label: ']', key: ']', code: 'BracketRight', keyCode: 221 },
    { label: '\\', key: '\\', code: 'Backslash', keyCode: 220 }
  ],
  // Row 3: Caps Lock & Home Row
  [
    { label: 'Caps', key: 'CapsLock', code: 'CapsLock', keyCode: 20, className: 'vkey-wide vkey-special', modifierType: 'caps' },
    { label: 'a', key: 'a', code: 'KeyA', keyCode: 65 },
    { label: 's', key: 's', code: 'KeyS', keyCode: 83 },
    { label: 'd', key: 'd', code: 'KeyD', keyCode: 68 },
    { label: 'f', key: 'f', code: 'KeyF', keyCode: 70 },
    { label: 'g', key: 'g', code: 'KeyG', keyCode: 71 },
    { label: 'h', key: 'h', code: 'KeyH', keyCode: 72 },
    { label: 'j', key: 'j', code: 'KeyJ', keyCode: 74 },
    { label: 'k', key: 'k', code: 'KeyK', keyCode: 75 },
    { label: 'l', key: 'l', code: 'KeyL', keyCode: 76 },
    { label: ';', key: ';', code: 'Semicolon', keyCode: 186 },
    { label: "'", key: "'", code: 'Quote', keyCode: 222 },
    { label: '↵ Enter', key: 'Enter', code: 'Enter', keyCode: 13, className: 'vkey-wide vkey-special' }
  ],
  // Row 4: Shift & Bottom Row + Arrow Up
  [
    { label: 'Shift', key: 'Shift', code: 'ShiftLeft', keyCode: 16, className: 'vkey-wide vkey-special', modifierType: 'shift' },
    { label: 'z', key: 'z', code: 'KeyZ', keyCode: 90 },
    { label: 'x', key: 'x', code: 'KeyX', keyCode: 88 },
    { label: 'c', key: 'c', code: 'KeyC', keyCode: 67 },
    { label: 'v', key: 'v', code: 'KeyV', keyCode: 86 },
    { label: 'b', key: 'b', code: 'KeyB', keyCode: 66 },
    { label: 'n', key: 'n', code: 'KeyN', keyCode: 78 },
    { label: 'm', key: 'm', code: 'KeyM', keyCode: 77 },
    { label: ',', key: ',', code: 'Comma', keyCode: 188 },
    { label: '.', key: '.', code: 'Period', keyCode: 190 },
    { label: '/', key: '/', code: 'Slash', keyCode: 191 },
    { label: '▲', key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, className: 'vkey-arrow' },
    { label: 'Shift', key: 'Shift', code: 'ShiftRight', keyCode: 16, className: 'vkey-wide vkey-special', modifierType: 'shift' }
  ],
  // Row 5: Modifiers, Space & Arrow Navigation Cluster
  [
    { label: 'Ctrl', key: 'Control', code: 'ControlLeft', keyCode: 17, className: 'vkey-special', modifierType: 'ctrl' },
    { label: 'Alt', key: 'Alt', code: 'AltLeft', keyCode: 18, className: 'vkey-special', modifierType: 'alt' },
    { label: 'Space', key: ' ', code: 'Space', keyCode: 32, className: 'vkey-space' },
    { label: 'Alt', key: 'Alt', code: 'AltRight', keyCode: 18, className: 'vkey-special', modifierType: 'alt' },
    { label: 'Ctrl', key: 'Control', code: 'ControlRight', keyCode: 17, className: 'vkey-special', modifierType: 'ctrl' },
    { label: '◄', key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37, className: 'vkey-arrow' },
    { label: '▼', key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, className: 'vkey-arrow' },
    { label: '►', key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, className: 'vkey-arrow' }
  ]
];

const SHIFT_SYMBOL_MAP: Record<string, string> = {
  '`': '~', '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
  '6': '^', '7': '&', '8': '*', '9': '(', '0': ')', '-': '_',
  '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"',
  ',': '<', '.': '>', '/': '?'
};

export interface VirtualKeyboardOptions {
  getIframeWindow: () => { window: Window | null; document: Document | null };
}

export class VirtualKeyboardManager {
  private getIframeWindow: () => { window: Window | null; document: Document | null };
  private container: HTMLDivElement | null = null;
  private rowsContainer: HTMLDivElement | null = null;
  private toggleBtn: HTMLButtonElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;

  public isShiftActive = false;
  public isCtrlActive = false;
  public isAltActive = false;
  public isCapsLockActive = false;

  constructor(options: VirtualKeyboardOptions) {
    this.getIframeWindow = options.getIframeWindow;
    this.init();
  }

  private init() {
    if (typeof document === "undefined") return;
    this.container = document.getElementById('virtual-keyboard') as HTMLDivElement;
    this.rowsContainer = document.getElementById('vkey-rows-container') as HTMLDivElement;
    this.toggleBtn = document.getElementById('keyboard-toggle-btn') as HTMLButtonElement;
    this.closeBtn = document.getElementById('close-keyboard-btn') as HTMLButtonElement;

    if (!this.container || !this.rowsContainer) return;

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => {
        const isHidden = this.container?.classList.toggle('hidden');
        if (this.toggleBtn) {
          this.toggleBtn.classList.toggle('active', !isHidden);
        }
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        if (this.container) this.container.classList.add('hidden');
        if (this.toggleBtn) this.toggleBtn.classList.remove('active');
      });
    }

    this.renderKeyboard();
  }

  public renderKeyboard() {
    const targetContainer = this.rowsContainer;
    if (!targetContainer) return;
    targetContainer.innerHTML = '';

    PC_KEYBOARD_ROWS.forEach((rowDef) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'vkey-row';

      rowDef.forEach((keyDef) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `vkey ${keyDef.className || ''}`;

        if (keyDef.modifierType) {
          if (
            (keyDef.modifierType === 'shift' && this.isShiftActive) ||
            (keyDef.modifierType === 'ctrl' && this.isCtrlActive) ||
            (keyDef.modifierType === 'alt' && this.isAltActive) ||
            (keyDef.modifierType === 'caps' && this.isCapsLockActive)
          ) {
            btn.classList.add('active-modifier');
          }
        }

        let displayLabel = keyDef.label;
        if (!keyDef.modifierType && keyDef.label.length === 1) {
          const isUppercase = this.isShiftActive !== this.isCapsLockActive;
          if (/[a-zA-Z]/.test(keyDef.label)) {
            displayLabel = isUppercase ? keyDef.label.toUpperCase() : keyDef.label.toLowerCase();
          } else if (this.isShiftActive && SHIFT_SYMBOL_MAP[keyDef.label]) {
            displayLabel = SHIFT_SYMBOL_MAP[keyDef.label];
          }
        }

        btn.textContent = displayLabel;

        const handlePressStart = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          btn.classList.add('pressed');

          if (keyDef.modifierType) {
            if (keyDef.modifierType === 'shift') this.isShiftActive = !this.isShiftActive;
            else if (keyDef.modifierType === 'ctrl') this.isCtrlActive = !this.isCtrlActive;
            else if (keyDef.modifierType === 'alt') this.isAltActive = !this.isAltActive;
            else if (keyDef.modifierType === 'caps') this.isCapsLockActive = !this.isCapsLockActive;

            this.renderKeyboard();
            this.dispatchKeyToIframe('keydown', keyDef);
            return;
          }

          let effectiveKey = keyDef.key;
          if (keyDef.key.length === 1) {
            const isUppercase = this.isShiftActive !== this.isCapsLockActive;
            if (/[a-zA-Z]/.test(keyDef.key)) {
              effectiveKey = isUppercase ? keyDef.key.toUpperCase() : keyDef.key.toLowerCase();
            } else if (this.isShiftActive && SHIFT_SYMBOL_MAP[keyDef.key]) {
              effectiveKey = SHIFT_SYMBOL_MAP[keyDef.key];
            }
          }

          this.dispatchKeyToIframe('keydown', { ...keyDef, key: effectiveKey });
        };

        const handlePressEnd = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          btn.classList.remove('pressed');

          if (keyDef.modifierType) {
            this.dispatchKeyToIframe('keyup', keyDef);
            return;
          }

          let effectiveKey = keyDef.key;
          if (keyDef.key.length === 1) {
            const isUppercase = this.isShiftActive !== this.isCapsLockActive;
            if (/[a-zA-Z]/.test(keyDef.key)) {
              effectiveKey = isUppercase ? keyDef.key.toUpperCase() : keyDef.key.toLowerCase();
            } else if (this.isShiftActive && SHIFT_SYMBOL_MAP[keyDef.key]) {
              effectiveKey = SHIFT_SYMBOL_MAP[keyDef.key];
            }
          }

          this.dispatchKeyToIframe('keyup', { ...keyDef, key: effectiveKey });
        };

        btn.addEventListener('touchstart', handlePressStart, { passive: false });
        btn.addEventListener('touchend', handlePressEnd, { passive: false });
        btn.addEventListener('touchcancel', handlePressEnd, { passive: false });

        btn.addEventListener('mousedown', handlePressStart);
        btn.addEventListener('mouseup', handlePressEnd);
        btn.addEventListener('mouseleave', (e) => {
          if (btn.classList.contains('pressed')) {
            handlePressEnd(e);
          }
        });

        rowEl.appendChild(btn);
      });

      targetContainer.appendChild(rowEl);
    });
  }

  public dispatchKeyToIframe(type: 'keydown' | 'keyup', keyDef: VirtualKeyDef) {
    try {
      const { window: iframeWin, document: iframeDoc } = this.getIframeWindow();
      if (!iframeWin || !iframeDoc) return;

      const eventInit: KeyboardEventInit = {
        key: keyDef.key,
        code: keyDef.code,
        keyCode: keyDef.keyCode,
        which: keyDef.keyCode,
        shiftKey: this.isShiftActive,
        ctrlKey: this.isCtrlActive,
        altKey: this.isAltActive,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: iframeWin
      };

      const KEvent = typeof KeyboardEvent !== 'undefined' ? KeyboardEvent : (iframeWin as any).KeyboardEvent;
      let event: any;
      if (KEvent) {
        event = new KEvent(type, eventInit);
      } else {
        event = { type, ...eventInit };
      }
      try {
        Object.defineProperty(event, 'keyCode', { get: () => keyDef.keyCode });
        Object.defineProperty(event, 'which', { get: () => keyDef.keyCode });
      } catch (e) {}

      iframeDoc.dispatchEvent(event);
      if (iframeDoc.activeElement && iframeDoc.activeElement !== iframeDoc.body) {
        iframeDoc.activeElement.dispatchEvent(event);
      } else {
        iframeWin.dispatchEvent(event);
      }
    } catch (err) {
      console.warn('Dispatch virtual keyboard key event error:', err);
    }
  }
}
