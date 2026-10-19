import { describe, it, expect, vi } from 'vitest';
import { VirtualKeyboardManager, PC_KEYBOARD_ROWS } from '../keyboard';

describe('Full PC & Gaming Keyboard Unit Tests', () => {
  it('should include all standard PC rows including F1-F12, Arrows, and Modifiers', () => {
    const allKeys = PC_KEYBOARD_ROWS.flat();

    const f1Key = allKeys.find((k) => k.code === 'F1');
    const f12Key = allKeys.find((k) => k.code === 'F12');
    const arrowUp = allKeys.find((k) => k.code === 'ArrowUp');
    const ctrlKey = allKeys.find((k) => k.code === 'ControlLeft');
    const altKey = allKeys.find((k) => k.code === 'AltLeft');
    const deleteKey = allKeys.find((k) => k.code === 'Delete');

    expect(f1Key).toBeDefined();
    expect(f1Key?.keyCode).toBe(112);

    expect(f12Key).toBeDefined();
    expect(f12Key?.keyCode).toBe(123);

    expect(arrowUp).toBeDefined();
    expect(arrowUp?.keyCode).toBe(38);

    expect(ctrlKey).toBeDefined();
    expect(ctrlKey?.keyCode).toBe(17);

    expect(altKey).toBeDefined();
    expect(altKey?.keyCode).toBe(18);

    expect(deleteKey).toBeDefined();
    expect(deleteKey?.keyCode).toBe(46);
  });

  it('should toggle sticky modifiers and dispatch key events with modifier state', () => {
    let lastDispatchedEvent: KeyboardEvent | null = null;

    const mockDoc = {
      activeElement: null,
      dispatchEvent: vi.fn((event: Event) => {
        lastDispatchedEvent = event as KeyboardEvent;
        return true;
      })
    };

    const mockWin = {
      dispatchEvent: vi.fn()
    };

    const keyboardManager = new VirtualKeyboardManager({
      getIframeWindow: () => ({
        window: mockWin as unknown as Window,
        document: mockDoc as unknown as Document
      })
    });

    // Initially modifiers are inactive
    expect(keyboardManager.isShiftActive).toBe(false);
    expect(keyboardManager.isCtrlActive).toBe(false);

    // Toggle Shift sticky modifier
    keyboardManager.isShiftActive = true;
    keyboardManager.isCtrlActive = true;

    // Dispatch a key event (e.g. 'KeyW')
    keyboardManager.dispatchKeyToIframe('keydown', {
      label: 'w',
      key: 'W',
      code: 'KeyW',
      keyCode: 87
    });

    expect(mockDoc.dispatchEvent).toHaveBeenCalled();
    expect(lastDispatchedEvent).not.toBeNull();
    expect((lastDispatchedEvent as unknown as KeyboardEvent).shiftKey).toBe(true);
    expect((lastDispatchedEvent as unknown as KeyboardEvent).ctrlKey).toBe(true);
    expect((lastDispatchedEvent as unknown as KeyboardEvent).altKey).toBe(false);
    expect((lastDispatchedEvent as unknown as KeyboardEvent).code).toBe('KeyW');
  });
});
