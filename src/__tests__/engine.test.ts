import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  detectEntryPoint,
  processExtractedFiles,
  validateSaveState,
  isProtectedKey
} from '../engine';

describe('Engine Unit Tests', () => {
  describe('Test 1: Path Normalization', () => {
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
  });
});
