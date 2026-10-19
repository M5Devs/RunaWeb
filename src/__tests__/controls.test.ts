import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  getKeybindings,
  saveKeybindings,
  resetKeybindings,
  getDefaultKeybindings,
  KEYBINDINGS_STORAGE_KEY
} from '../controls';

describe('Key Mapping & Remapper Unit Tests', () => {
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

  it('should return default keybindings when localStorage is empty', () => {
    const bindings = getKeybindings();
    const defaults = getDefaultKeybindings();

    expect(bindings).toEqual(defaults);
    expect(bindings.A[0].code).toBe('Space');
    expect(bindings.ArrowUp[0].code).toBe('ArrowUp');
  });

  it('should persistently save custom keybindings to localStorage', () => {
    const bindings = getKeybindings();
    bindings.A = [{ key: 'j', code: 'KeyJ', keyCode: 74 }];
    bindings.B = [{ key: 'k', code: 'KeyK', keyCode: 75 }];

    saveKeybindings(bindings);

    const savedRaw = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
    expect(savedRaw).not.toBeNull();

    const retrieved = getKeybindings();
    expect(retrieved.A[0].code).toBe('KeyJ');
    expect(retrieved.B[0].code).toBe('KeyK');
  });

  it('should fallback to defaults for missing or invalid action bindings', () => {
    localStorage.setItem(
      KEYBINDINGS_STORAGE_KEY,
      JSON.stringify({
        A: [{ key: 'x', code: 'KeyX', keyCode: 88 }]
        // Missing ArrowUp, B, X, Y, etc.
      })
    );

    const bindings = getKeybindings();
    expect(bindings.A[0].code).toBe('KeyX');
    expect(bindings.ArrowUp[0].code).toBe('ArrowUp');
    expect(bindings.START[0].code).toBe('Enter');
  });

  it('should reset keybindings back to default configuration', () => {
    const custom = getKeybindings();
    custom.A = [{ key: 'q', code: 'KeyQ', keyCode: 81 }];
    saveKeybindings(custom);

    expect(getKeybindings().A[0].code).toBe('KeyQ');

    const resetBindings = resetKeybindings();
    expect(resetBindings.A[0].code).toBe('Space');
    expect(getKeybindings().A[0].code).toBe('Space');
  });
});
