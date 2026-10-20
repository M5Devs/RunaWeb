/**
 * WASM-4 Fantasy Console Micro-Runtime Generator for RunaWeb.
 * Provides full WASM-4 cartridge loading, memory mapping, drawing API,
 * Web Audio APU synthesizer for tone(), disk storage, and 60fps retro framebuffer rendering.
 */

export function isWasm4File(filename: string): boolean {
  return filename.toLowerCase().endsWith('.wasm');
}

export function generateWasm4Html(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WASM-4 Runtime</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    canvas {
      width: 100%;
      height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  </style>
</head>
<body>
  <canvas id="canvas" width="160" height="160"></canvas>
  <script>
    (async function() {
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      const imgData = ctx.createImageData(160, 160);

      // WASM-4 Memory: 64KB (1 page)
      const memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
      const memBytes = new Uint8Array(memory.buffer);
      const mem32 = new Uint32Array(memory.buffer);

      // Initialize default palette at 0x0004 (4 x uint32_t colors: 0x00RRGGBB)
      // Color 1: #e0f8cf, Color 2: #86c06c, Color 3: #2b543d, Color 4: #0c1822
      const defaultPalette = [0xe0f8cf, 0x86c06c, 0x2b543d, 0x0c1822];
      for (let i = 0; i < 4; i++) {
        mem32[1 + i] = defaultPalette[i];
      }

      // Default DRAW_COLORS at 0x0014 (0x1234)
      const view16 = new Uint16Array(memory.buffer);
      view16[0x0014 >> 1] = 0x1234;

      // WASM-4 Gamepad bits
      let gamepadState = 0;

      const KEY_MAPPINGS = {
        'ArrowLeft': 16,  // DPAD_LEFT
        'KeyA': 16,
        'a': 16,
        'ArrowRight': 32, // DPAD_RIGHT
        'KeyD': 32,
        'd': 32,
        'ArrowUp': 64,    // DPAD_UP
        'KeyW': 64,
        'w': 64,
        'ArrowDown': 128, // DPAD_DOWN
        'KeyS': 128,
        's': 128,
        'KeyX': 1,        // BUTTON_1
        'Space': 1,
        ' ': 1,
        'KeyZ': 1,
        'z': 1,
        'KeyC': 2,        // BUTTON_2
        'Escape': 2
      };

      function updateGamepadByte() {
        memBytes[0x0016] = gamepadState;
      }

      window.addEventListener('keydown', (e) => {
        const bit = KEY_MAPPINGS[e.code] || KEY_MAPPINGS[e.key];
        if (bit) {
          gamepadState |= bit;
          updateGamepadByte();
        }
      });

      window.addEventListener('keyup', (e) => {
        const bit = KEY_MAPPINGS[e.code] || KEY_MAPPINGS[e.key];
        if (bit) {
          gamepadState &= ~bit;
          updateGamepadByte();
        }
      });

      // Web Audio APU Sound Synthesizer Engine
      let audioCtx = null;

      function getAudioContext() {
        if (window.parent && window.parent.__runaAudioContext) {
          return window.parent.__runaAudioContext;
        }
        if (!audioCtx) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) audioCtx = new AudioCtx();
        }
        return audioCtx;
      }

      function initAudio() {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      }

      ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
        window.addEventListener(evt, initAudio, { passive: true, capture: true });
        document.addEventListener(evt, initAudio, { passive: true, capture: true });
      });

      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'RUNAWEB_AUDIO_UNLOCK') {
          initAudio();
        }
      });

      const pulseWaveCache = {};

      function getPulseWave(duty) {
        const audioCtx = getAudioContext();
        if (!audioCtx) return null;
        if (pulseWaveCache[duty]) return pulseWaveCache[duty];

        const numHarmonics = 64;
        const real = new Float32Array(numHarmonics);
        const imag = new Float32Array(numHarmonics);

        let dutyCycle = 0.5;
        if (duty === 0) dutyCycle = 0.125;
        else if (duty === 1) dutyCycle = 0.25;
        else if (duty === 2) dutyCycle = 0.50;
        else if (duty === 3) dutyCycle = 0.75;

        for (let n = 1; n < numHarmonics; n++) {
          imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * dutyCycle);
        }

        const wave = audioCtx.createPeriodicWave(real, imag);
        pulseWaveCache[duty] = wave;
        return wave;
      }

      function createNoiseBuffer(is7Bit) {
        const audioCtx = getAudioContext();
        if (!audioCtx) return null;
        const sampleRate = audioCtx.sampleRate || 44100;
        const buffer = audioCtx.createBuffer(1, sampleRate, sampleRate);
        const data = buffer.getChannelData(0);

        let reg = 0x7f80;
        for (let i = 0; i < sampleRate; i++) {
          let feedback = 0;
          if (is7Bit) {
            feedback = ((reg & 1) ^ ((reg >> 1) & 1));
            reg = (reg >> 1) | (feedback << 6);
          } else {
            feedback = ((reg & 1) ^ ((reg >> 1) & 1));
            reg = (reg >> 1) | (feedback << 14);
          }
          data[i] = (reg & 1) ? 1.0 : -1.0;
        }
        return buffer;
      }

      let whiteNoiseBuf = null;
      let buzzyNoiseBuf = null;

      // Simple 8x8 font bitmap decoder
      const font = new Uint8Array([
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00, 0x00,0x00,0x5f,0x00,0x00,0x00,0x00,0x00,
        0x00,0x07,0x00,0x07,0x00,0x00,0x00,0x00, 0x14,0x7f,0x14,0x7f,0x14,0x00,0x00,0x00,
        0x24,0x2a,0x7f,0x2a,0x12,0x00,0x00,0x00, 0x23,0x13,0x08,0x64,0x62,0x00,0x00,0x00,
        0x36,0x49,0x55,0x22,0x50,0x00,0x00,0x00, 0x00,0x05,0x03,0x00,0x00,0x00,0x00,0x00,
        0x00,0x1c,0x22,0x41,0x00,0x00,0x00,0x00, 0x00,0x41,0x22,0x1c,0x00,0x00,0x00,0x00,
        0x14,0x08,0x3e,0x08,0x14,0x00,0x00,0x00, 0x08,0x08,0x3e,0x08,0x08,0x00,0x00,0x00,
        0x00,0x50,0x30,0x00,0x00,0x00,0x00,0x00, 0x08,0x08,0x08,0x08,0x08,0x00,0x00,0x00,
        0x00,0x60,0x60,0x00,0x00,0x00,0x00,0x00, 0x20,0x10,0x08,0x04,0x02,0x00,0x00,0x00,
        0x3e,0x51,0x49,0x45,0x3e,0x00,0x00,0x00, 0x00,0x42,0x7f,0x40,0x00,0x00,0x00,0x00,
        0x42,0x61,0x51,0x49,0x46,0x00,0x00,0x00, 0x21,0x41,0x45,0x4b,0x31,0x00,0x00,0x00,
        0x18,0x14,0x12,0x7f,0x10,0x00,0x00,0x00, 0x27,0x45,0x45,0x45,0x39,0x00,0x00,0x00,
        0x3c,0x4a,0x49,0x49,0x30,0x00,0x00,0x00, 0x01,0x71,0x09,0x05,0x03,0x00,0x00,0x00,
        0x36,0x49,0x49,0x49,0x36,0x00,0x00,0x00, 0x06,0x49,0x49,0x29,0x1e,0x00,0x00,0x00,
        0x00,0x36,0x36,0x00,0x00,0x00,0x00,0x00, 0x00,0x56,0x36,0x00,0x00,0x00,0x00,0x00,
        0x08,0x14,0x22,0x41,0x00,0x00,0x00,0x00, 0x14,0x14,0x14,0x14,0x14,0x00,0x00,0x00,
        0x00,0x41,0x22,0x14,0x08,0x00,0x00,0x00, 0x02,0x01,0x51,0x09,0x06,0x00,0x00,0x00,
        0x3e,0x41,0x5d,0x55,0x1e,0x00,0x00,0x00, 0x7e,0x11,0x11,0x11,0x7e,0x00,0x00,0x00,
        0x7f,0x49,0x49,0x49,0x36,0x00,0x00,0x00, 0x3e,0x41,0x41,0x41,0x22,0x00,0x00,0x00,
        0x7f,0x41,0x41,0x22,0x1c,0x00,0x00,0x00, 0x7f,0x49,0x49,0x49,0x41,0x00,0x00,0x00,
        0x7f,0x09,0x09,0x09,0x01,0x00,0x00,0x00, 0x3e,0x41,0x49,0x49,0x7a,0x00,0x00,0x00,
        0x7f,0x08,0x08,0x08,0x7f,0x00,0x00,0x00, 0x00,0x41,0x7f,0x41,0x00,0x00,0x00,0x00,
        0x20,0x40,0x41,0x3f,0x01,0x00,0x00,0x00, 0x7f,0x08,0x14,0x22,0x41,0x00,0x00,0x00,
        0x7f,0x40,0x40,0x40,0x40,0x00,0x00,0x00, 0x7f,0x02,0x0c,0x02,0x7f,0x00,0x00,0x00,
        0x7f,0x04,0x08,0x10,0x7f,0x00,0x00,0x00, 0x3e,0x41,0x41,0x41,0x3e,0x00,0x00,0x00,
        0x7f,0x09,0x09,0x09,0x06,0x00,0x00,0x00, 0x3e,0x41,0x51,0x21,0x5e,0x00,0x00,0x00,
        0x7f,0x09,0x19,0x29,0x46,0x00,0x00,0x00, 0x26,0x49,0x49,0x49,0x32,0x00,0x00,0x00,
        0x01,0x01,0x7f,0x01,0x01,0x00,0x00,0x00, 0x3f,0x40,0x40,0x40,0x3f,0x00,0x00,0x00,
        0x1f,0x20,0x40,0x20,0x1f,0x00,0x00,0x00, 0x3f,0x40,0x38,0x40,0x3f,0x00,0x00,0x00,
        0x63,0x14,0x08,0x14,0x63,0x00,0x00,0x00, 0x07,0x08,0x70,0x08,0x07,0x00,0x00,0x00,
        0x61,0x51,0x49,0x45,0x43,0x00,0x00,0x00, 0x00,0x7f,0x41,0x41,0x00,0x00,0x00,0x00,
        0x02,0x04,0x08,0x10,0x20,0x00,0x00,0x00, 0x00,0x41,0x41,0x7f,0x00,0x00,0x00,0x00,
        0x04,0x02,0x01,0x02,0x04,0x00,0x00,0x00, 0x40,0x40,0x40,0x40,0x40,0x00,0x00,0x00,
        0x00,0x01,0x02,0x04,0x00,0x00,0x00,0x00, 0x20,0x54,0x54,0x54,0x78,0x00,0x00,0x00,
        0x7f,0x48,0x44,0x44,0x38,0x00,0x00,0x00, 0x38,0x44,0x44,0x44,0x20,0x00,0x00,0x00,
        0x38,0x44,0x44,0x48,0x7f,0x00,0x00,0x00, 0x38,0x54,0x54,0x54,0x18,0x00,0x00,0x00,
        0x08,0x7e,0x09,0x01,0x02,0x00,0x00,0x00, 0x18,0xa4,0xa4,0xa4,0x7c,0x00,0x00,0x00,
        0x7f,0x08,0x04,0x04,0x78,0x00,0x00,0x00, 0x00,0x44,0x7d,0x40,0x00,0x00,0x00,0x00,
        0x20,0x40,0x44,0x3d,0x00,0x00,0x00,0x00, 0x7f,0x10,0x28,0x44,0x00,0x00,0x00,0x00,
        0x00,0x41,0x7f,0x40,0x00,0x00,0x00,0x00, 0x7c,0x04,0x18,0x04,0x78,0x00,0x00,0x00,
        0x7c,0x08,0x04,0x04,0x78,0x00,0x00,0x00, 0x38,0x44,0x44,0x44,0x38,0x00,0x00,0x00,
        0xfc,0x24,0x24,0x24,0x18,0x00,0x00,0x00, 0x18,0x24,0x24,0x24,0xfc,0x00,0x00,0x00,
        0x7c,0x08,0x04,0x04,0x08,0x00,0x00,0x00, 0x48,0x54,0x54,0x54,0x24,0x00,0x00,0x00,
        0x04,0x3e,0x44,0x24,0x00,0x00,0x00,0x00, 0x3c,0x40,0x40,0x20,0x7c,0x00,0x00,0x00,
        0x1c,0x20,0x40,0x20,0x1c,0x00,0x00,0x00, 0x3c,0x40,0x30,0x40,0x3c,0x00,0x00,0x00,
        0x44,0x28,0x10,0x28,0x44,0x00,0x00,0x00, 0x1c,0xa0,0xa0,0xa0,0x7c,0x00,0x00,0x00,
        0x44,0x64,0x54,0x4c,0x44,0x00,0x00,0x00, 0x08,0x36,0x41,0x00,0x00,0x00,0x00,0x00,
        0x00,0x00,0x77,0x00,0x00,0x00,0x00,0x00, 0x00,0x41,0x36,0x08,0x00,0x00,0x00,0x00,
        0x02,0x01,0x02,0x04,0x02,0x00,0x00,0x00, 0x3c,0x26,0x23,0x26,0x3c,0x00,0x00,0x00
      ]);

      function getDrawColor(idx) {
        const drawColors = view16[0x0014 >> 1];
        const colorSelect = (drawColors >> (idx * 4)) & 0xf;
        if (colorSelect === 0) return -1; // transparent
        return (colorSelect - 1) & 0x3;
      }

      function setPixel(x, y, colorIdx) {
        if (x < 0 || x >= 160 || y < 0 || y >= 160 || colorIdx < 0) return;
        const index = y * 160 + x;
        const byteIndex = 0x00a0 + (index >> 2);
        const shift = 6 - ((index & 3) << 1);
        memBytes[byteIndex] = (memBytes[byteIndex] & ~(3 << shift)) | ((colorIdx & 3) << shift);
      }

      // WASM-4 Imports Object
      const imports = {
        env: {
          memory,

          rect(x, y, width, height) {
            const fillColor = getDrawColor(0);
            const strokeColor = getDrawColor(1);

            for (let dy = 0; dy < height; dy++) {
              for (let dx = 0; dx < width; dx++) {
                const px = x + dx;
                const py = y + dy;
                const isBorder = dx === 0 || dx === width - 1 || dy === 0 || dy === height - 1;

                if (isBorder && strokeColor >= 0) {
                  setPixel(px, py, strokeColor);
                } else if (!isBorder && fillColor >= 0) {
                  setPixel(px, py, fillColor);
                }
              }
            }
          },

          oval(x, y, width, height) {
            const fillColor = getDrawColor(0);
            const strokeColor = getDrawColor(1);
            const rx = width / 2;
            const ry = height / 2;
            const cx = x + rx;
            const cy = y + ry;

            for (let py = y; py < y + height; py++) {
              for (let px = x; px < x + width; px++) {
                const dx = (px - cx + 0.5) / rx;
                const dy = (py - cy + 0.5) / ry;
                const dist = dx * dx + dy * dy;

                if (dist <= 1) {
                  if (strokeColor >= 0 && dist >= 0.7) {
                    setPixel(px, py, strokeColor);
                  } else if (fillColor >= 0) {
                    setPixel(px, py, fillColor);
                  }
                }
              }
            }
          },

          line(x1, y1, x2, y2) {
            const color = getDrawColor(0);
            if (color < 0) return;

            let dx = Math.abs(x2 - x1);
            let dy = Math.abs(y2 - y1);
            let sx = x1 < x2 ? 1 : -1;
            let sy = y1 < y2 ? 1 : -1;
            let err = dx - dy;

            let currX = x1;
            let currY = y1;

            while (true) {
              setPixel(currX, currY, color);
              if (currX === x2 && currY === y2) break;
              let e2 = 2 * err;
              if (e2 > -dy) { err -= dy; currX += sx; }
              if (e2 < dx) { err += dx; currY += sy; }
            }
          },

          hline(x, y, len) {
            const color = getDrawColor(0);
            if (color < 0) return;
            for (let i = 0; i < len; i++) {
              setPixel(x + i, y, color);
            }
          },

          vline(x, y, len) {
            const color = getDrawColor(0);
            if (color < 0) return;
            for (let i = 0; i < len; i++) {
              setPixel(x, y + i, color);
            }
          },

          text(textPtr, x, y) {
            imports.env.textUtf8(textPtr, 256, x, y);
          },

          textUtf8(textPtr, byteLength, x, y) {
            const textColor = getDrawColor(0);
            const bgColor = getDrawColor(1);

            let currX = x;
            let currY = y;

            for (let i = 0; i < byteLength; i++) {
              const code = memBytes[textPtr + i];
              if (code === 0) break;
              if (code === 10) { // newline
                currX = x;
                currY += 8;
                continue;
              }

              const glyphIdx = (code - 32) * 8;
              for (let col = 0; col < 8; col++) {
                const bits = font[glyphIdx + col] || 0;
                for (let row = 0; row < 8; row++) {
                  if (bits & (1 << row)) {
                    if (textColor >= 0) setPixel(currX + col, currY + row, textColor);
                  } else if (bgColor >= 0) {
                    setPixel(currX + col, currY + row, bgColor);
                  }
                }
              }
              currX += 8;
            }
          },

          blit(spritePtr, x, y, width, height, flags) {
            imports.env.blitSub(spritePtr, x, y, width, height, 0, 0, width, flags);
          },

          blitSub(spritePtr, x, y, width, height, srcX, srcY, stride, flags) {
            const is2bpp = (flags & 1) !== 0;
            const flipX = (flags & 2) !== 0;
            const flipY = (flags & 4) !== 0;
            const rotate = (flags & 8) !== 0;

            for (let sy = 0; sy < height; sy++) {
              for (let sx = 0; sx < width; sx++) {
                const srcPx = srcX + sx;
                const srcPy = srcY + sy;

                let colorIdx = 0;
                if (!is2bpp) { // 1bpp
                  const bitIdx = srcPy * stride + srcPx;
                  const byte = memBytes[spritePtr + (bitIdx >> 3)];
                  const bit = (byte >> (7 - (bitIdx & 7))) & 1;
                  colorIdx = bit ? 1 : 0;
                } else { // 2bpp
                  const pixelIdx = srcPy * stride + srcPx;
                  const byte = memBytes[spritePtr + (pixelIdx >> 2)];
                  const shift = 6 - ((pixelIdx & 3) << 1);
                  colorIdx = (byte >> shift) & 3;
                }

                const mappedColor = getDrawColor(colorIdx);
                if (mappedColor >= 0) {
                  let outX = flipX ? (width - 1 - sx) : sx;
                  let outY = flipY ? (height - 1 - sy) : sy;

                  if (rotate) {
                    const tmp = outX;
                    outX = outY;
                    outY = tmp;
                  }

                  setPixel(x + outX, y + outY, mappedColor);
                }
              }
            }
          },

          tone(frequency, duration, volume, flags) {
            initAudio();
            const audioCtx = getAudioContext();
            if (!audioCtx) return;

            let freq1 = frequency & 0xffff;
            let freq2 = (frequency >> 16) & 0xffff;

            // Bit 6: Note Mode (MIDI Note numbers to Hz)
            if ((flags & 64) !== 0) {
              const note1 = frequency & 0xff;
              const bend1 = (frequency >> 8) & 0xff;
              freq1 = 440 * Math.pow(2, (note1 - 69 + (bend1 / 256)) / 12);

              if (freq2 > 0) {
                const note2 = (frequency >> 16) & 0xff;
                const bend2 = (frequency >> 24) & 0xff;
                freq2 = 440 * Math.pow(2, (note2 - 69 + (bend2 / 256)) / 12);
              }
            }
            if (freq2 === 0) freq2 = freq1;

            const sustainFrames = duration & 0xff;
            const releaseFrames = (duration >> 8) & 0xff;
            const decayFrames = (duration >> 16) & 0xff;
            const attackFrames = (duration >> 24) & 0xff;

            const totalFrames = attackFrames + decayFrames + sustainFrames + releaseFrames;
            if (totalFrames === 0) return;

            let peakVol = volume & 0xff;
            if (peakVol === 0) peakVol = 100;
            let sustainVol = (volume >> 8) & 0xff;
            if (sustainVol === 0 && sustainFrames > 0) sustainVol = peakVol;

            const peakGain = (peakVol / 100) * 0.25;
            const sustainGain = (sustainVol / 100) * 0.25;

            const channel = flags & 0x03;
            const duty = (flags >> 2) & 0x03;
            const pan = (flags >> 4) & 0x03;

            const startTime = audioCtx.currentTime;
            const attackTime = startTime + (attackFrames / 60);
            const decayTime = attackTime + (decayFrames / 60);
            const sustainTime = decayTime + (sustainFrames / 60);
            const stopTime = sustainTime + (releaseFrames / 60);

            const gainNode = audioCtx.createGain();
            gainNode.gain.setValueAtTime(0, startTime);
            if (attackFrames > 0) {
              gainNode.gain.linearRampToValueAtTime(peakGain, attackTime);
            } else {
              gainNode.gain.setValueAtTime(peakGain, startTime);
            }
            if (decayFrames > 0) {
              gainNode.gain.linearRampToValueAtTime(sustainGain, decayTime);
            } else {
              gainNode.gain.setValueAtTime(sustainGain, attackTime);
            }
            gainNode.gain.setValueAtTime(sustainGain, sustainTime);
            if (releaseFrames > 0) {
              gainNode.gain.linearRampToValueAtTime(0, stopTime);
            } else {
              gainNode.gain.setValueAtTime(0, sustainTime);
            }

            let outputNode = gainNode;
            if (audioCtx.createStereoPanner) {
              const panner = audioCtx.createStereoPanner();
              let panVal = 0;
              if (pan === 1) panVal = -1;
              else if (pan === 2) panVal = 1;
              panner.pan.setValueAtTime(panVal, startTime);
              gainNode.connect(panner);
              outputNode = panner;
            }
            outputNode.connect(audioCtx.destination);

            if (channel === 0 || channel === 1) { // Pulse 1 or Pulse 2
              const osc = audioCtx.createOscillator();
              const wave = getPulseWave(duty);
              if (wave) osc.setPeriodicWave(wave);

              osc.frequency.setValueAtTime(freq1, startTime);
              if (freq2 !== freq1) {
                osc.frequency.linearRampToValueAtTime(freq2, stopTime);
              }
              osc.connect(gainNode);
              osc.start(startTime);
              osc.stop(stopTime);

            } else if (channel === 2) { // Triangle
              const osc = audioCtx.createOscillator();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(freq1, startTime);
              if (freq2 !== freq1) {
                osc.frequency.linearRampToValueAtTime(freq2, stopTime);
              }
              osc.connect(gainNode);
              osc.start(startTime);
              osc.stop(stopTime);

            } else if (channel === 3) { // Noise
              const is7Bit = (duty & 1) !== 0;
              let buffer = is7Bit ? buzzyNoiseBuf : whiteNoiseBuf;
              if (!buffer) {
                buffer = createNoiseBuffer(is7Bit);
                if (is7Bit) buzzyNoiseBuf = buffer;
                else whiteNoiseBuf = buffer;
              }

              if (buffer) {
                const src = audioCtx.createBufferSource();
                src.buffer = buffer;
                src.loop = true;

                const baseFreq = is7Bit ? 1000 : 4410;
                const playbackRate = (freq1 || 440) / baseFreq;
                src.playbackRate.setValueAtTime(playbackRate, startTime);
                if (freq2 !== freq1 && freq2 > 0) {
                  const endPlaybackRate = freq2 / baseFreq;
                  src.playbackRate.linearRampToValueAtTime(endPlaybackRate, stopTime);
                }

                src.connect(gainNode);
                src.start(startTime);
                src.stop(stopTime);
              }
            }
          },

          diskr(destPtr, size) {
            try {
              const saved = localStorage.getItem('runaweb_wasm4_disk');
              if (!saved) return 0;
              const binary = atob(saved);
              const readSize = Math.min(size, binary.length);
              for (let i = 0; i < readSize; i++) {
                memBytes[destPtr + i] = binary.charCodeAt(i);
              }
              return readSize;
            } catch (e) {
              return 0;
            }
          },

          diskw(srcPtr, size) {
            try {
              let binary = '';
              for (let i = 0; i < size; i++) {
                binary += String.fromCharCode(memBytes[srcPtr + i]);
              }
              localStorage.setItem('runaweb_wasm4_disk', btoa(binary));
              return size;
            } catch (e) {
              return 0;
            }
          },

          trace(strPtr) {
            let str = '';
            let ptr = strPtr;
            while (memBytes[ptr] !== 0) {
              str += String.fromCharCode(memBytes[ptr++]);
            }
            console.log('[WASM-4 Trace]:', str);
          },

          traceUtf8(strPtr, byteLength) {
            let str = '';
            for (let i = 0; i < byteLength; i++) {
              str += String.fromCharCode(memBytes[strPtr + i]);
            }
            console.log('[WASM-4 Trace]:', str);
          }
        }
      };

      try {
        const response = await fetch('cart.wasm');
        const bytes = await response.arrayBuffer();
        const module = await WebAssembly.instantiate(bytes, imports);
        const exports = module.instance.exports;

        if (exports.start) exports.start();

        function renderFrame() {
          if (exports.update) exports.update();

          // Render Framebuffer (0x00a0 .. 0x00a0 + 6400) to Canvas ImageData using Palette
          let fbPtr = 0x00a0;
          let imgPtr = 0;

          // Palette uint32 values in little-endian (0x00RRGGBB)
          const p0 = mem32[1];
          const p1 = mem32[2];
          const p2 = mem32[3];
          const p3 = mem32[4];

          const palette = [
            [(p0 >> 16) & 0xff, (p0 >> 8) & 0xff, p0 & 0xff],
            [(p1 >> 16) & 0xff, (p1 >> 8) & 0xff, p1 & 0xff],
            [(p2 >> 16) & 0xff, (p2 >> 8) & 0xff, p2 & 0xff],
            [(p3 >> 16) & 0xff, (p3 >> 8) & 0xff, p3 & 0xff]
          ];

          for (let i = 0; i < 6400; i++) {
            const byte = memBytes[fbPtr + i];
            for (let shift = 6; shift >= 0; shift -= 2) {
              const cIdx = (byte >> shift) & 3;
              const rgb = palette[cIdx];
              imgData.data[imgPtr] = rgb[0];
              imgData.data[imgPtr + 1] = rgb[1];
              imgData.data[imgPtr + 2] = rgb[2];
              imgData.data[imgPtr + 3] = 255;
              imgPtr += 4;
            }
          }

          ctx.putImageData(imgData, 0, 0);
          requestAnimationFrame(renderFrame);
        }

        requestAnimationFrame(renderFrame);

      } catch (err) {
        console.error('WASM-4 Cartridge Load Error:', err);
      }
    })();
  </script>
</body>
</html>`;
}
