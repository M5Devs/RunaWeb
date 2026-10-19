import { describe, it, expect } from 'vitest';
import { isWasm4File, generateWasm4Html } from '../wasm4';

describe('WASM-4 Engine & Cartridge Unit Tests', () => {
  it('should correctly detect .wasm file extension', () => {
    expect(isWasm4File('cart.wasm')).toBe(true);
    expect(isWasm4File('MY_GAME.WASM')).toBe(true);
    expect(isWasm4File('/path/to/game.wasm')).toBe(true);
    expect(isWasm4File('game.html')).toBe(false);
    expect(isWasm4File('game.zip')).toBe(false);
    expect(isWasm4File('wasm_game.js')).toBe(false);
  });

  it('should generate a valid, self-contained WASM-4 runtime index.html', () => {
    const html = generateWasm4Html();

    expect(typeof html).toBe('string');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<canvas id="canvas" width="160" height="160">');
    expect(html).toContain('WebAssembly.Memory');

    // Verify core memory addresses
    expect(html).toContain('0x0004'); // Palette address
    expect(html).toContain('0x0014'); // Draw colors address
    expect(html).toContain('0x0016'); // Gamepad address
    expect(html).toContain('0x00a0'); // Framebuffer address

    // Verify core drawing API imports
    expect(html).toContain('rect(');
    expect(html).toContain('oval(');
    expect(html).toContain('line(');
    expect(html).toContain('hline(');
    expect(html).toContain('vline(');
    expect(html).toContain('text(');
    expect(html).toContain('textUtf8(');
    expect(html).toContain('blit(');
    expect(html).toContain('blitSub(');
    expect(html).toContain('tone(');
    expect(html).toContain('diskr(');
    expect(html).toContain('diskw(');
    expect(html).toContain('trace(');
  });

  it('should generate complete WASM-4 Web Audio APU synthesizer logic', () => {
    const html = generateWasm4Html();

    // Verify Web Audio APU initialization & gesture unlocking
    expect(html).toContain('initAudio()');
    expect(html).toContain('pointerdown');
    expect(html).toContain('touchstart');
    expect(html).toContain('keydown');

    // Verify Pulse 1 & 2 duty cycles support
    expect(html).toContain('getPulseWave(');
    expect(html).toContain('createPeriodicWave');

    // Verify LFSR Noise channel (15-bit white noise and 7-bit buzzy mode)
    expect(html).toContain('createNoiseBuffer(');
    expect(html).toContain('buzzyNoiseBuf');
    expect(html).toContain('whiteNoiseBuf');

    // Verify ADSR envelopes and stereo panning
    expect(html).toContain('linearRampToValueAtTime');
    expect(html).toContain('createStereoPanner');
  });
});
