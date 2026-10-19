export interface SavedGame {
  id: string;
  name: string;
  date: number;
  zipData: ArrayBuffer;
  size: number;
  coverUrl?: string;
  isSingleHtml?: boolean;
  isWasm4?: boolean;
}

const DB_NAME = 'runaweb_db';
const DB_VERSION = 1;
const STORE_NAME = 'runaweb_games';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveGame(game: SavedGame): Promise<void> {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota !== undefined && estimate.usage !== undefined) {
        const remaining = estimate.quota - estimate.usage;
        if (remaining < game.size) {
          const err = new Error('QuotaExceededError: Storage quota exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        throw e;
      }
      console.warn('Storage estimate failed or skipped:', e);
    }
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(game);

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        const err = tx.error || new Error('Transaction error in IndexedDB.');
        db.close();
        reject(err);
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

export async function getSavedGames(): Promise<SavedGame[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        db.close();
        resolve(request.result as SavedGame[]);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

export async function loadGameById(id: string): Promise<SavedGame | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        db.close();
        resolve(request.result as SavedGame | undefined);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}

export async function deleteGame(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        const err = tx.error || new Error('Transaction error in IndexedDB.');
        db.close();
        reject(err);
      };
    } catch (err) {
      db.close();
      reject(err);
    }
  });
}
