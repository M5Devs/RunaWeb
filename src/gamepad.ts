// Physical Gamepad API Module for RunaWeb
import { getKeybindings, InputAction, KeyMapping } from './controls';

const GAMEPAD_BUTTON_ACTION_MAP: Record<number, InputAction> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  8: 'SELECT',
  9: 'START',
  12: 'ArrowUp',
  13: 'ArrowDown',
  14: 'ArrowLeft',
  15: 'ArrowRight'
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

      gp.buttons.forEach((btn, index) => {
        if (btn.pressed) {
          currentPressedKeys.add(`btn_${index}`);
        }
      });

      if (gp.axes.length >= 2) {
        const axisX = gp.axes[0];
        const axisY = gp.axes[1];

        if (axisX < -AXIS_THRESHOLD) currentPressedKeys.add('btn_14');
        if (axisX > AXIS_THRESHOLD) currentPressedKeys.add('btn_15');
        if (axisY < -AXIS_THRESHOLD) currentPressedKeys.add('btn_12');
        if (axisY > AXIS_THRESHOLD) currentPressedKeys.add('btn_13');
      }
    }

    this.activeButtons.forEach((btnKey) => {
      if (!currentPressedKeys.has(btnKey)) {
        this.dispatchStateChange(btnKey, false);
        this.activeButtons.delete(btnKey);
      }
    });

    currentPressedKeys.forEach((btnKey) => {
      if (!this.activeButtons.has(btnKey)) {
        this.activeButtons.add(btnKey);
        this.dispatchStateChange(btnKey, true);
      }
    });
  }

  private dispatchStateChange(btnKey: string, isPressed: boolean) {
    const buttonIndex = parseInt(btnKey.replace('btn_', ''), 10);
    const action = GAMEPAD_BUTTON_ACTION_MAP[buttonIndex];
    if (!action) return;

    const keybindings = getKeybindings();
    const mappings: KeyMapping[] = keybindings[action] || [];
    if (mappings.length === 0) return;

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
