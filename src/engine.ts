/**
 * Engine utility module for RunaWeb.
 * Handles path normalization, entry point detection, save state validation, and storage isolation.
 */

export const PROTECTED_KEY_PREFIXES = ['runaweb_app_', 'runaweb_db'] as const;

/**
 * Normalizes file paths by converting backslashes to forward slashes
 * and stripping leading slashes.
 */
export function normalizePath(path: string): string {
  if (!path) return '';
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Checks if a key belongs to RunaWeb host internal configuration or database storage.
 */
export function isProtectedKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  return PROTECTED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Finds the entry point (index.html) across flat or nested directory paths.
 */
export function detectEntryPoint(paths: string[]): string {
  const normalizedPaths = paths.map(normalizePath);

  if (normalizedPaths.includes('index.html')) {
    return 'index.html';
  }

  const exactIndexMatch = normalizedPaths.find((p) => p.toLowerCase() === 'index.html');
  if (exactIndexMatch) {
    return exactIndexMatch;
  }

  const nestedIndexMatch = normalizedPaths.find((p) => p.toLowerCase().endsWith('/index.html'));
  if (nestedIndexMatch) {
    return nestedIndexMatch;
  }

  return 'index.html';
}

/**
 * Processes unzipped file map, stripping common root folder prefixes if present,
 * normalizing all file paths, and detecting the entry point.
 */
export function processExtractedFiles(unzipped: Record<string, Uint8Array>): {
  normalizedMap: Record<string, Uint8Array>;
  entryPath: string;
} {
  const filePaths = Object.keys(unzipped);

  let paths = filePaths
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !p.endsWith('/'));

  let commonPrefix = '';
  while (paths.length > 0) {
    const firstPathParts = paths[0].split('/');
    if (firstPathParts.length <= 1) break;

    const potentialPrefix = firstPathParts[0] + '/';
    const allStartWithPrefix = paths.every(
      (p) => p.startsWith(potentialPrefix) && p.length > potentialPrefix.length
    );

    if (allStartWithPrefix) {
      commonPrefix += potentialPrefix;
      paths = paths.map((p) => p.slice(potentialPrefix.length));
    } else {
      break;
    }
  }

  const normalizedMap: Record<string, Uint8Array> = {};
  for (const rawPath of filePaths) {
    const normalizedRaw = rawPath.replace(/\\/g, '/');
    if (normalizedRaw.endsWith('/')) continue;

    let cleanPath = normalizedRaw;
    if (commonPrefix && cleanPath.startsWith(commonPrefix)) {
      cleanPath = cleanPath.slice(commonPrefix.length);
    }
    cleanPath = normalizePath(cleanPath);
    if (cleanPath) {
      normalizedMap[cleanPath] = unzipped[rawPath];
    }
  }

  const entryPath = detectEntryPoint(Object.keys(normalizedMap));
  return { normalizedMap, entryPath };
}

export interface SaveStatePayload {
  game?: string;
  timestamp?: number;
  data: Record<string, string>;
}

/**
 * Strictly validates imported JSON save file format and blocks protected keys.
 */
export function validateSaveState(json: unknown): Record<string, string> {
  if (
    !json ||
    typeof json !== 'object' ||
    Array.isArray(json) ||
    !('data' in json) ||
    !json.data ||
    typeof json.data !== 'object' ||
    Array.isArray(json.data)
  ) {
    throw new Error('Invalid save file format');
  }

  const rawData = json.data as Record<string, unknown>;
  const sanitizedData: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawData)) {
    // Explicitly BLOCK overwriting host keys that begin with runaweb_app_ or runaweb_db
    if (isProtectedKey(key)) {
      continue;
    }

    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      sanitizedData[key] = String(value);
    } else {
      throw new Error('Invalid save file format');
    }
  }

  return sanitizedData;
}
