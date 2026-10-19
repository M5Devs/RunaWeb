import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  TOUCH_LAYOUT_STORAGE_KEY,
  getDefaultTouchLayout,
  getTouchLayout,
  saveTouchLayout,
  resetTouchLayout,
  applyTouchLayoutToDOM,
  TouchLayoutConfig
} from '../touch-editor';

describe('PPSSPP-Style Touch Layout Editor Unit Tests', () => {
  const store: Record<string, string> = {};

  beforeAll(() => {
    const mockLocalStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value.toString();
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key in store) {
          delete store[key];
        }
      }
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true
    });
  });

  beforeEach(() => {
    localStorage.clear();
  });

  it('should return default layout schema for all controls', () => {
    const layout = getDefaultTouchLayout();

    expect(layout).toHaveProperty('dpad');
    expect(layout).toHaveProperty('select');
    expect(layout).toHaveProperty('start');
    expect(layout).toHaveProperty('actionY');
    expect(layout).toHaveProperty('actionX');
    expect(layout).toHaveProperty('actionB');
    expect(layout).toHaveProperty('actionA');

    expect(layout.dpad.scale).toBe(1.0);
    expect(layout.dpad.opacity).toBe(1.0);
    expect(layout.dpad.visible).toBe(true);
    expect(layout.dpad.glyphOnly).toBe(false);
  });

  it('should fall back to default layout if localStorage is empty or corrupt', () => {
    expect(getTouchLayout()).toEqual(getDefaultTouchLayout());

    localStorage.setItem(TOUCH_LAYOUT_STORAGE_KEY, 'invalid-json-string');
    expect(getTouchLayout()).toEqual(getDefaultTouchLayout());
  });

  it('should save and load custom touch layout from localStorage persistently', () => {
    const customLayout: TouchLayoutConfig = getDefaultTouchLayout();
    customLayout.dpad.x = 15;
    customLayout.dpad.y = 50;
    customLayout.dpad.scale = 1.4;
    customLayout.dpad.opacity = 0.8;
    customLayout.dpad.glyphOnly = true;

    saveTouchLayout(customLayout);

    const loaded = getTouchLayout();
    expect(loaded.dpad.x).toBe(15);
    expect(loaded.dpad.y).toBe(50);
    expect(loaded.dpad.scale).toBe(1.4);
    expect(loaded.dpad.opacity).toBe(0.8);
    expect(loaded.dpad.glyphOnly).toBe(true);
  });

  it('should reset touch layout back to default schema', () => {
    const customLayout: TouchLayoutConfig = getDefaultTouchLayout();
    customLayout.actionA.scale = 1.8;
    saveTouchLayout(customLayout);

    expect(getTouchLayout().actionA.scale).toBe(1.8);

    const reseted = resetTouchLayout();
    expect(reseted.actionA.scale).toBe(1.0);
    expect(getTouchLayout().actionA.scale).toBe(1.0);
  });

  it('should correctly apply layout styles and glyph-only class to virtual gamepad DOM elements', () => {
    const dpadEl = {
      style: {} as Record<string, string>,
      classList: {
        classes: new Set<string>(),
        add(cls: string) { this.classes.add(cls); },
        remove(cls: string) { this.classes.delete(cls); },
        contains(cls: string) { return this.classes.has(cls); }
      }
    };

    const btnA = {
      style: {} as Record<string, string>,
      classList: {
        classes: new Set<string>(),
        add(cls: string) { this.classes.add(cls); },
        remove(cls: string) { this.classes.delete(cls); },
        contains(cls: string) { return this.classes.has(cls); }
      }
    };

    const gamepadContainer = {
      querySelector: (selector: string) => {
        if (selector === '.dpad-container') return dpadEl;
        if (selector === 'button[data-button="A"]') return btnA;
        return null;
      }
    } as any;

    const customLayout: TouchLayoutConfig = getDefaultTouchLayout();
    customLayout.dpad.x = 20;
    customLayout.dpad.y = 40;
    customLayout.dpad.scale = 1.25;
    customLayout.dpad.opacity = 0.75;
    customLayout.dpad.glyphOnly = true;

    customLayout.actionA.visible = false;

    applyTouchLayoutToDOM(gamepadContainer, customLayout);

    expect(dpadEl.style.left).toBe('20%');
    expect(dpadEl.style.top).toBe('40%');
    expect(dpadEl.style.transform).toBe('scale(1.25)');
    expect(dpadEl.style.opacity).toBe('0.75');
    expect(dpadEl.classList.contains('glyph-only')).toBe(true);

    expect(btnA.style.display).toBe('none');
  });
});
