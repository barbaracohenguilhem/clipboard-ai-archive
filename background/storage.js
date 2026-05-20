const DB_NAME = 'clipboard-archive';
const DB_VERSION = 1;
const STORE = 'clips';

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by_created_at', 'created_at');
        store.createIndex('by_type', 'type');
        store.createIndex('by_hash', 'hash', { unique: false });
        store.createIndex('by_tag', 'tags', { multiEntry: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      db.close();
      reject(err);
      return;
    }
    tx.oncomplete = () => {
      db.close();
      Promise.resolve(result).then(resolve, reject);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('tx aborted'));
    };
  });
}

export async function addClip(clip) {
  return withStore('readwrite', (store) => promisify(store.add(clip)));
}

export async function findByHash(hash) {
  return withStore('readonly', async (store) => {
    const idx = store.index('by_hash');
    const result = await promisify(idx.get(hash));
    return result || null;
  });
}

export async function listRecent(limit = 20) {
  return withStore('readonly', (store) => {
    const out = [];
    return new Promise((resolve, reject) => {
      const idx = store.index('by_created_at');
      const req = idx.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && out.length < limit) {
          out.push(cursor.value);
          cursor.continue();
        } else {
          resolve(out);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function updateTags(id, tags) {
  return withStore('readwrite', async (store) => {
    const clip = await promisify(store.get(id));
    if (!clip) return;
    clip.tags = tags;
    await promisify(store.put(clip));
  });
}

export async function setPinned(id, pinned) {
  return withStore('readwrite', async (store) => {
    const clip = await promisify(store.get(id));
    if (!clip) return;
    clip.pinned = !!pinned;
    await promisify(store.put(clip));
  });
}

export async function deleteClip(id) {
  return withStore('readwrite', (store) => promisify(store.delete(id)));
}

export async function deleteOlderThan(cutoffMs) {
  return withStore('readwrite', (store) => {
    let removed = 0;
    return new Promise((resolve, reject) => {
      const idx = store.index('by_created_at');
      const range = IDBKeyRange.upperBound(cutoffMs, true);
      const req = idx.openCursor(range);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (!cursor.value.pinned) {
            cursor.delete();
            removed++;
          }
          cursor.continue();
        } else {
          resolve(removed);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getStats() {
  return withStore('readonly', (store) => {
    return new Promise((resolve, reject) => {
      const countReq = store.count();
      countReq.onsuccess = () => {
        const count = countReq.result;
        const idx = store.index('by_created_at');
        const firstReq = idx.openCursor();
        firstReq.onsuccess = (e) => {
          const cursor = e.target.result;
          resolve({ count, earliest: cursor ? cursor.value.created_at : null });
        };
        firstReq.onerror = () => reject(firstReq.error);
      };
      countReq.onerror = () => reject(countReq.error);
    });
  });
}

export async function clearAll() {
  return withStore('readwrite', (store) => promisify(store.clear()));
}

export async function getAll() {
  return withStore('readonly', (store) => promisify(store.getAll()));
}
