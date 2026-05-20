import { MSG } from '../shared/messages.js';

const TYPES = ['All', 'URL', 'Code', 'Color', 'Email', 'Phone', 'Address', 'Text'];

const state = {
  clips: [],
  filterType: 'All',
  query: '',
};

const els = {
  list: document.getElementById('clip-list'),
  empty: document.getElementById('empty'),
  search: document.getElementById('search'),
  filters: document.getElementById('filters'),
  toast: document.getElementById('toast'),
  openPanel: document.getElementById('open-panel'),
  pause: document.getElementById('pause'),
  settings: document.getElementById('settings'),
};

function renderFilters() {
  els.filters.innerHTML = '';
  for (const t of TYPES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (t === state.filterType ? ' active' : '');
    btn.textContent = t;
    btn.addEventListener('click', () => {
      state.filterType = t;
      renderFilters();
      renderList();
    });
    els.filters.appendChild(btn);
  }
}

function relativeTime(ts) {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function filterClips() {
  const q = state.query.toLowerCase().trim();
  return state.clips.filter((c) => {
    if (state.filterType !== 'All' && c.type !== state.filterType) return false;
    if (!q) return true;
    if (c.text.toLowerCase().includes(q)) return true;
    if (c.tags?.some((t) => t.includes(q))) return true;
    if (c.source_url?.toLowerCase().includes(q)) return true;
    return false;
  });
}

function renderList() {
  const items = filterClips().slice(0, 20);
  els.empty.hidden = items.length > 0;
  els.list.innerHTML = '';
  for (const clip of items) {
    const li = document.createElement('li');
    li.className = 'clip';
    li.dataset.id = clip.id;

    const meta = document.createElement('div');
    meta.className = 'clip-meta';
    const left = document.createElement('span');
    left.textContent = `${clip.type} · ${relativeTime(clip.created_at)}`;
    const right = document.createElement('span');
    right.textContent = clip.pinned ? '📌' : '';
    meta.append(left, right);

    const textEl = document.createElement('div');
    textEl.className = 'clip-text';
    textEl.textContent = clip.text.slice(0, 200);

    li.append(meta, textEl);

    if (clip.tags?.length) {
      const tagsEl = document.createElement('div');
      tagsEl.className = 'clip-tags';
      for (const t of clip.tags) {
        const chip = document.createElement('span');
        chip.className = 'clip-tag';
        chip.textContent = `#${t}`;
        tagsEl.appendChild(chip);
      }
      li.appendChild(tagsEl);
    }

    if (clip.source_url) {
      const src = document.createElement('div');
      src.className = 'clip-source';
      src.textContent = hostnameOf(clip.source_url) || clip.source_url;
      li.appendChild(src);
    }

    li.addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(clip.text);
        showToast('Copied!');
      } catch {
        showToast('Copy failed');
      }
      if (e.shiftKey) window.close();
    });
    els.list.appendChild(li);
  }
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  setTimeout(() => (els.toast.hidden = true), 1200);
}

async function loadClips() {
  try {
    const clips = await chrome.runtime.sendMessage({
      type: MSG.GET_CLIPS,
      payload: { limit: 50 },
    });
    state.clips = clips || [];
    renderList();
  } catch (err) {
    console.warn('loadClips failed', err);
    state.clips = [];
    renderList();
  }
}

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  renderList();
});

els.openPanel.addEventListener('click', async () => {
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  } catch (err) {
    console.warn('open side panel failed', err);
  }
});

els.pause.addEventListener('click', async () => {
  const { paused } = await chrome.runtime.sendMessage({ type: MSG.GET_PAUSE_STATE });
  if (paused) {
    await chrome.runtime.sendMessage({ type: MSG.RESUME });
    els.pause.textContent = 'Pause';
  } else {
    await chrome.runtime.sendMessage({
      type: MSG.PAUSE,
      payload: { until: Date.now() + 10 * 60 * 1000 },
    });
    els.pause.textContent = 'Resume';
  }
});

els.settings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if ([MSG.CLIP_ADDED, MSG.CLIP_UPDATED, MSG.CLIP_DELETED].includes(msg.type)) {
    loadClips();
  }
});

renderFilters();
loadClips();
chrome.runtime.sendMessage({ type: MSG.GET_PAUSE_STATE }).then((s) => {
  if (s?.paused) els.pause.textContent = 'Resume';
}).catch(() => {});
