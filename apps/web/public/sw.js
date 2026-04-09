// runq service worker — narrowly scoped to handle the PWA share target.
// Does NOT precache app assets or interfere with HMR; the only fetch event
// it touches is POST /finance/share-receive (the manifest share_target action).
//
// Flow:
//   1. Android user shares files from WhatsApp → runq via Share Sheet
//   2. The browser POSTs the multipart form to /finance/share-receive
//   3. This SW intercepts that POST, stashes the files in IndexedDB,
//      and 303-redirects the user to /finance/ar/po-inbox?share=pending
//   4. The inbox page reads from IndexedDB on mount and uploads each file
//      via the existing useUploadPoFile mutation (which uses the user's
//      JWT from localStorage — auth lives in the main thread, not the SW).

const SHARE_RECEIVE_PATH = '/finance/share-receive';
const REDIRECT_TO = '/finance/ar/po-inbox?share=pending';
const REDIRECT_ERROR = '/finance/ar/po-inbox?share=error';
const DB_NAME = 'runq-share';
const DB_STORE = 'pending';
const DB_VERSION = 1;

self.addEventListener('install', () => {
  // Activate immediately on first install so the share intercept becomes
  // available without forcing a manual reload.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === SHARE_RECEIVE_PATH) {
    event.respondWith(handleShare(event.request));
  }
  // Everything else: don't call respondWith → default browser handling.
});

async function handleShare(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    const text = (formData.get('text') || '').toString();
    const title = (formData.get('title') || '').toString();

    const fileItems = [];
    for (const f of files) {
      if (f instanceof File && f.size > 0) {
        // Read into ArrayBuffer so we can serialize it through IndexedDB.
        // File objects themselves are clonable but ArrayBuffers are more
        // portable across SW → main-thread reads.
        const data = await f.arrayBuffer();
        fileItems.push({
          name: f.name || 'shared',
          type: f.type || 'application/octet-stream',
          size: f.size,
          data,
        });
      }
    }

    await stashShareData({
      files: fileItems,
      text,
      title,
      ts: Date.now(),
    });

    return Response.redirect(REDIRECT_TO, 303);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[runq sw] share intake failed:', err);
    return Response.redirect(REDIRECT_ERROR, 303);
  }
}

function openDb() {
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

async function stashShareData(data) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).add(data);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
