// Physical Gamepad API Module for RunaWeb

interface KeyMapping {
  key: string;
  code: string;
  keyCode: number;
}

const BUTTON_MAPPINGS: Record<number, KeyMapping[]> = {
  // Button 0 (A / Cross) -> Space
  0: [{ key: ' ', code: 'Space', keyCode: 32 }],
  // Button 1 (B / Circle) -> KeyZ / Escape
  1: [{ key: 'z', code: 'KeyZ', keyCode: 90 }, { key: 'Escape', code: 'Escape', keyCode: 27 }],
  // Button 2 (X / Square) -> KeyX
  2: [{ key: 'x', code: 'KeyX', keyCode: 88 }],
  // Button 3 (Y / Triangle) -> KeyC / Enter
  3: [{ key: 'c', code: 'KeyC', keyCode: 67 }, { key: 'Enter', code: 'Enter', keyCode: 13 }],
  // Button 8 (Select) -> Tab / Shift
  8: [{ key: 'Tab', code: 'Tab', keyCode: 9 }, { key: 'Shift', code: 'ShiftLeft', keyCode: 16 }],
  // Button 9 (Start) -> Enter / P
  9: [{ key: 'Enter', code: 'Enter', keyCode: 13 }, { key: 'p', code: 'KeyP', keyCode: 80 }],
  // D-Pad Up (12)
  12: [{ key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 }, { key: 'w', code: 'KeyW', keyCode: 87 }],
  // D-Pad Down (13)
  13: [{ key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }, { key: 's', code: 'KeyS', keyCode: 83 }],
  // D-Pad Left (14)
  14: [{ key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 }, { key: 'a', code: 'KeyA', keyCode: 65 }],
  // D-Pad Right (15)
  15: [{ key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 }, { key: 'd', code: 'KeyD', keyCode: 68 }]
};

const AXIS_THRESHOLD = 0.5;

interface GamepadManagerOptions {
  getIframeWindow: () => { window: Window | null; document: Document | null };
  onGamepadConnected: () => void;
  onGamepadDisconnected: () => void;
  showToast: (message: string) => void;
}

export class PhysicalGamepadManager {
  private getIframeWindow: () => { window: Window | null; document: Document | null };
  private onGamepadConnected: () => void;
  private onGamepadDisconnected: () => void;
  private showToast: (message: string) => void;

  private activeButtons: Set<string> = new Set();
  private animFrameId: number | null = null;
  public isConnected = false;

  constructor(options: GamepadManagerOptions) {
    this.getIframeWindow = options.getIframeWindow;
    this.onGamepadConnected = options.onGamepadConnected;
    this.onGamepadDisconnected = options.onGamepadDisconnected;
    this.showToast = options.showToast;

    this.initListeners();
  }

  private initListeners() {
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.isConnected = true;
      this.showToast(`🎮 Controller Connected: ${e.gamepad.id.split('(')[0].trim() || 'Gamepad'}`);
      this.onGamepadConnected();
      this.startPolling();
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      this.showToast(`🎮 Controller Disconnected: ${e.gamepad.id.split('(')[0].trim() || 'Gamepad'}`);
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let anyConnected = false;
      for (const gp of gamepads) {
        if (gp && gp.connected) {
          anyConnected = true;
          break;
        }
      }

      if (!anyConnected) {
        this.isConnected = false;
        this.stopPolling();
        this.onGamepadDisconnected();
      }
    });

    // Initial check if gamepads were already connected before load
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gamepads) {
      if (gp && gp.connected) {
        this.isConnected = true;
        this.onGamepadConnected();
        this.startPolling();
        break;
      }
    }
  }

  private startPolling() {
    if (this.animFrameId !== null) return;
    const poll = () => {
      this.pollGamepadState();
      this.animFrameId = requestAnimationFrame(poll);
    };
    this.animFrameId = requestAnimationFrame(poll);
  }

  private stopPolling() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    // Release any stuck buttons
    this.activeButtons.forEach((btnKey) => {
      this.dispatchStateChange(btnKey, false);
    });
    this.activeButtons.clear();
  }

  private pollGamepadState() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const currentPressedKeys = new Set<string>();

    for (const gp of gamepads) {
      if (!gp || !gp.connected) continue;

      // Check standard buttons
      gp.buttons.forEach((btn, index) => {
        if (btn.pressed) {
          currentPressedKeys.add(`btn_${index}`);
        }
      });

      // Left Stick X / Y mapped to D-Pad direction
      if (gp.axes.length >= 2) {
        const axisX = gp.axes[0];
        const axisY = gp.axes[1];

        if (axisX < -AXIS_THRESHOLD) currentPressedKeys.add('btn_14'); // Left
        if (axisX > AXIS_THRESHOLD) currentPressedKeys.add('btn_15');  // Right
        if (axisY < -AXIS_THRESHOLD) currentPressedKeys.add('btn_12'); // Up
        if (axisY > AXIS_THRESHOLD) currentPressedKeys.add('btn_13');  // Down
      }
    }

    // Process releases
    this.activeButtons.forEach((btnKey) => {
      if (!currentPressedKeys.has(btnKey)) {
        this.dispatchStateChange(btnKey, false);
        this.activeButtons.delete(btnKey);
      }
    });

    // Process presses
    currentPressedKeys.forEach((btnKey) => {
      if (!this.activeButtons.has(btnKey)) {
        this.activeButtons.add(btnKey);
        this.dispatchStateChange(btnKey, true);
      }
    });
  }

  private dispatchStateChange(btnKey: string, isPressed: boolean) {
    const buttonIndex = parseInt(btnKey.replace('btn_', ''), 10);
    const mappings = BUTTON_MAPPINGS[buttonIndex];
    if (!mappings) return;

    const { window: iframeWin, document: iframeDoc } = this.getIframeWindow();
    if (!iframeWin || !iframeDoc) return;

    const eventType = isPressed ? 'keydown' : 'keyup';

    mappings.forEach((mapping) => {
      const eventInit: KeyboardEventInit = {
        key: mapping.key,
        code: mapping.code,
        keyCode: mapping.keyCode,
        which: mapping.keyCode,
        bubbles: true,
        cancelable: true,
        composed: true,
        view: iframeWin
      };

      const event = new KeyboardEvent(eventType, eventInit);
      Object.defineProperty(event, 'keyCode', { get: () => mapping.keyCode });
      Object.defineProperty(event, 'which', { get: () => mapping.keyCode });

      iframeDoc.dispatchEvent(event);
      if (iframeDoc.activeElement && iframeDoc.activeElement !== iframeDoc.body) {
        iframeDoc.activeElement.dispatchEvent(event);
      } else {
        iframeWin.dispatchEvent(event);
      }
    });
  }
}
