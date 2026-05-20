import { SETTINGS_KEY, DEFAULT_SETTINGS } from '../shared/messages.js';

const els = {
  retention: document.getElementById('retention'),
  aiEnabled: document.getElementById('ai-enabled'),
  blocklist: document.getElementById('blocklist'),
  save: document.getElementById('save'),
  saved: document.getElementById('saved'),
  exportBtn: document.getElementById('export'),
  importBtn: document.getElementById('import'),
  importFile: document.getElementById('import-file'),
  deleteAll: document.getElementById('delete-all'),
};

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const s = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
  els.retention.value = s.retentionDays == null ? '' : String(s.retentionDays);
  els.aiEnabled.checked = s.aiEnabled;
  els.blocklist.value = (s.blocklist || []).join('\n');
}

els.save.addEventListener('click', async () => {
  const retentionDays =
    els.retention.value === '' ? null : Number(els.retention.value);
  const aiEnabled = els.aiEnabled.checked;
  const blocklist = els.blocklist.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { retentionDays, aiEnabled, blocklist },
  });
  els.saved.hidden = false;
  setTimeout(() => (els.saved.hidden = true), 1500);
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('clipboard-archive');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

els.exportBtn.addEventListener('click', async () => {
  try {
    const db = await openDb();
    const tx = db.transaction('clips', 'readonly');
    const store = tx.objectStore('clips');
    const req = store.getAll();
    req.onsuccess = () => {
      const blob = new Blob([JSON.stringify(req.result, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: `clipboard-archive-${new Date()
          .toISOString()
          .slice(0, 10)}.json`,
      });
    };
  } catch (err) {
    alert('Export failed: ' + err.message);
  }
});

els.importBtn.addEventListener('click', () => els.importFile.click());

els.importFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  let items;
  try {
    items = JSON.parse(await file.text());
  } catch {
    alert('Invalid JSON file');
    return;
  }
  if (!Array.isArray(items)) {
    alert('Expected an array of clips');
    return;
  }
  try {
    const db = await openDb();
    const tx = db.transaction('clips', 'readwrite');
    const store = tx.objectStore('clips');
    let added = 0;
    for (const it of items) {
      delete it.id;
      store.add(it);
      added++;
    }
    tx.oncomplete = () => alert(`Imported ${added} clips`);
    tx.onerror = () => alert('Import failed: ' + tx.error?.message);
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
});

els.deleteAll.addEventListener('click', async () => {
  if (!confirm('Delete ALL clipboard history? This cannot be undone.')) return;
  try {
    const db = await openDb();
    const tx = db.transaction('clips', 'readwrite');
    tx.objectStore('clips').clear();
    tx.oncomplete = () => alert('All clips deleted');
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
});

loadSettings();
