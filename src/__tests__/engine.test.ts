import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  detectEntryPoint,
  processExtractedFiles,
  validateSaveState,
  isProtectedKey,
  generateSessionToken,
  validateIPCMessage,
  MAX_SAVE_STATE_SIZE_BYTES
} from '../engine';

describe('Engine Unit Tests', () => {
  describe('Test 1: Path Normalization & Zip-Slip Protection', () => {
    it('should convert backslashes to forward slashes and strip leading slashes', () => {
      expect(normalizePath('\\assets\\js\\main.js')).toBe('assets/js/main.js');
      expect(normalizePath('///css/style.css')).toBe('css/style.css');
      expect(normalizePath('\\\\/lib/math.js')).toBe('lib/math.js');
      expect(normalizePath('index.html')).toBe('index.html');
      expect(normalizePath('')).toBe('');
    });

    it('should strip common nested root folder prefixes from unzipped archives', () => {
      const dummyContent = new Uint8Array([1, 2, 3]);
      const unzipped = {
        'MyGameFolder/index.html': dummyContent,
        'MyGameFolder/assets/script.js': dummyContent,
        'MyGameFolder/assets/images/bg.png': dummyContent,
      };

      const result = processExtractedFiles(unzipped);
      expect(Object.keys(result.normalizedMap)).toEqual([
        'index.html',
        'assets/script.js',
        'assets/images/bg.png'
      ]);
      expect(result.entryPath).toBe('index.html');
    });

    it('should throw explicit SecurityError for Zip-Slip path traversal sequences', () => {
      const traversalPaths = [
        '../evil.js',
        './../config.json',
        'foo/../../bar.js',
        'nested\\..\\..\\secret.txt',
        'assets/../../../etc/passwd'
      ];

      for (const p of traversalPaths) {
        expect(() => normalizePath(p)).toThrow(
          'SecurityError: Path traversal sequence detected in archive'
        );
      }
    });

    it('should reject unzipped archives containing path traversal files in processExtractedFiles', () => {
      const dummy = new Uint8Array([1, 2, 3]);
      const maliciousArchives: Record<string, Uint8Array>[] = [
        { '../evil.js': dummy, 'index.html': dummy },
        { 'folder/../../secret.txt': dummy, 'index.html': dummy },
        { 'a/b/../../../etc/shadow': dummy }
      ];

      for (const archive of maliciousArchives) {
        expect(() => processExtractedFiles(archive)).toThrow(
          'SecurityError: Path traversal sequence detected in archive'
        );
      }
    });
  });

  describe('Test 2: Entry Point Detection', () => {
    it('should identify index.html at root level', () => {
      const paths = ['style.css', 'index.html', 'game.js'];
      expect(detectEntryPoint(paths)).toBe('index.html');
    });

    it('should identify index.html case-insensitively', () => {
      const paths = ['style.css', 'INDEX.HTML', 'game.js'];
      expect(detectEntryPoint(paths)).toBe('INDEX.HTML');
    });

    it('should identify nested index.html across directories', () => {
      const paths = ['assets/logo.png', 'dist/build/INDEX.HTML', 'bundle.js'];
      expect(detectEntryPoint(paths)).toBe('dist/build/INDEX.HTML');
    });

    it('should fallback to default index.html if no index.html is present', () => {
      const paths = ['main.js', 'style.css'];
      expect(detectEntryPoint(paths)).toBe('index.html');
    });
  });

  describe('Test 3: Save State Schema Validation & Namespacing', () => {
    it('should validate a correct save state structure with valid primitives', () => {
      const validPayload = {
        game: 'Super Game',
        timestamp: 1710000000000,
        data: {
          highScore: '1000',
          level: 5,
          hasPassed: true,
          checkpoint: null
        }
      };

      const sanitized = validateSaveState(validPayload);
      expect(sanitized).toEqual({
        highScore: '1000',
        level: '5',
        hasPassed: 'true',
        checkpoint: 'null'
      });
    });

    it('should throw an error for null, non-objects, or missing/invalid data field', () => {
      expect(() => validateSaveState(null)).toThrow('Invalid save file format');
      expect(() => validateSaveState('invalid string')).toThrow('Invalid save file format');
      expect(() => validateSaveState({})).toThrow('Invalid save file format');
      expect(() => validateSaveState({ data: 'not an object' })).toThrow('Invalid save file format');
      expect(() => validateSaveState({ data: null })).toThrow('Invalid save file format');
      expect(() => validateSaveState([])).toThrow('Invalid save file format');
    });

    it('should throw an error when data values contain non-primitive objects/arrays', () => {
      const invalidPayload = {
        data: {
          validKey: 'ok',
          nestedObj: { x: 1 }
        }
      };
      expect(() => validateSaveState(invalidPayload)).toThrow('Invalid save file format');
    });

    it('should explicitly block overwriting protected runaweb_app_ and runaweb_db keys', () => {
      expect(isProtectedKey('runaweb_app_theme')).toBe(true);
      expect(isProtectedKey('runaweb_app_settings')).toBe(true);
      expect(isProtectedKey('runaweb_db')).toBe(true);
      expect(isProtectedKey('runaweb_db_cache')).toBe(true);
      expect(isProtectedKey('game_score')).toBe(false);

      const maliciousPayload = {
        game: 'Malicious Save',
        data: {
          'game_level': '10',
          'runaweb_app_config': 'hacked',
          'runaweb_db': 'corrupted'
        }
      };

      const sanitized = validateSaveState(maliciousPayload);
      expect(sanitized).toHaveProperty('game_level', '10');
      expect(sanitized).not.toHaveProperty('runaweb_app_config');
      expect(sanitized).not.toHaveProperty('runaweb_db');
    });

    it('should reject oversized save state payloads', () => {
      const hugeString = 'A'.repeat(MAX_SAVE_STATE_SIZE_BYTES + 100);
      const oversizedPayload = {
        data: {
          hugeKey: hugeString
        }
      };

      expect(() => validateSaveState(oversizedPayload)).toThrow(
        'Save state payload exceeds maximum allowed size'
      );
    });
  });

  describe('Test 4: IPC Nonce Validation', () => {
    it('should generate a unique, cryptographically secure session token', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();

      expect(typeof token1).toBe('string');
      expect(token1.length).toBeGreaterThan(0);
      expect(token1).not.toBe(token2);
    });

    it('should accept IPC messages with matching valid session tokens', () => {
      const token = generateSessionToken();
      const validMsg = {
        type: 'RUNAWEB_GAME_PAUSE',
        sessionToken: token
      };

      expect(validateIPCMessage(validMsg, token)).toBe(true);
    });

    it('should reject IPC messages with missing, mismatched, or spoofed session tokens', () => {
      const validToken = generateSessionToken();
      const spoofedToken = generateSessionToken();

      const missingTokenMsg = { type: 'RUNAWEB_GAME_PAUSE' };
      const wrongTokenMsg = { type: 'RUNAWEB_GAME_PAUSE', sessionToken: spoofedToken };
      const emptyTokenMsg = { type: 'RUNAWEB_GAME_PAUSE', sessionToken: '' };

      expect(validateIPCMessage(missingTokenMsg, validToken)).toBe(false);
      expect(validateIPCMessage(wrongTokenMsg, validToken)).toBe(false);
      expect(validateIPCMessage(emptyTokenMsg, validToken)).toBe(false);
      expect(validateIPCMessage(wrongTokenMsg, null)).toBe(false);
    });

    it('should reject malformed non-object IPC message payloads', () => {
      const token = generateSessionToken();

      expect(validateIPCMessage(null, token)).toBe(false);
      expect(validateIPCMessage('string payload', token)).toBe(false);
      expect(validateIPCMessage(12345, token)).toBe(false);
      expect(validateIPCMessage([], token)).toBe(false);
      expect(validateIPCMessage({ sessionToken: token }, token)).toBe(false); // missing type
    });
  });
});
