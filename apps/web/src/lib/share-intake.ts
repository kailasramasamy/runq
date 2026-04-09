// Client-side counterpart to public/sw.js — reads files that the service
// worker stashed in IndexedDB after a PWA share-target POST, and lets the
// inbox page upload them via the existing JWT-authenticated mutation.
//
// The SW cannot make authenticated API calls itself (it doesn't have access
// to localStorage), so the hand-off pattern is:
//   SW → IndexedDB → main-thread reads → existing useUploadPoFile mutation.

const DB_NAME = 'runq-share';
const DB_STORE = 'pending';
const DB_VERSION = 1;

interface SharedFileBlob {
  name: string;
  type: string;
  size: number;
  data: ArrayBuffer;
}

export interface SharedItem {
  id?: number;
  files: SharedFileBlob[];
  text: string;
  title: string;
  ts: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Reads all pending shared items, deletes them from the store, and returns
 * them. The delete-on-read semantics make this safe to call from a useEffect:
 * even if the effect re-runs, you won't double-upload.
 */
export async function consumePendingShares(): Promise<SharedItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const items: SharedItem[] = [];

    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        items.push(cursor.value as SharedItem);
        cursor.delete();
        cursor.continue();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);

    tx.oncomplete = () => {
      db.close();
      resolve(items);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Convert the SW-stashed blob shape back into a real File object. */
export function sharedBlobToFile(blob: SharedFileBlob): File {
  return new File([blob.data], blob.name, { type: blob.type });
}
