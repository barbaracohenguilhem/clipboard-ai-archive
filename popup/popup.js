import { MSG } from '../shared/messages.js';

const TYPES = ['All', 'URL', 'Code', 'Color', 'Email', 'Phone', 'Address', 'Text'];

const state = {
  clips: [],
  filterType: 'All',
  query: '',
  selectedIdx: 0,
  paused: false,
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
  pausedBanner: document.getElementById('paused-banner'),
  resumeBanner: document.getElementById('resume-banner'),
};

function renderFilters() {
  els.filters.innerHTML = '';
  for (const t of TYPES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (t === state.filterType ? ' active' : '');
    btn.textContent = t;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(t === state.filterType));
    btn.addEventListener('click', () => {
      state.filterType = t;
      state.selectedIdx = 0;
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

async function copyClip(clip, closeAfter = false) {
  try {
    await navigator.clipboard.writeText(clip.text);
    showToast('Copied!');
  } catch {
    showToast('Copy failed');
  }
  if (closeAfter) window.close();
}

function renderList() {
  const items = filterClips().slice(0, 20);
  els.empty.hidden = items.length > 0;
  if (state.selectedIdx >= items.length) state.selectedIdx = Math.max(0, items.length - 1);

  els.list.innerHTML = '';
  items.forEach((clip, i) => {
    const li = document.createElement('li');
    li.className = 'clip' + (i === state.selectedIdx ? ' selected' : '');
    li.dataset.id = clip.id;
    li.setAttribute('role', 'option');
    li.tabIndex = -1;

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

    li.addEventListener('click', (e) => copyClip(clip, e.shiftKey));
    li.addEventListener('mouseenter', () => {
      state.selectedIdx = i;
      updateSelectionHighlight();
    });
    els.list.appendChild(li);
  });
}

function updateSelectionHighlight() {
  const lis = els.list.querySelectorAll('.clip');
  lis.forEach((li, i) =>
    li.classList.toggle('selected', i === state.selectedIdx)
  );
  const sel = lis[state.selectedIdx];
  sel?.scrollIntoView({ block: 'nearest' });
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  setTimeout(() => (els.toast.hidden = true), 1200);
}

function updatePauseUI() {
  els.pause.textContent = state.paused ? 'Resume' : 'Pause';
  els.pausedBanner.hidden = !state.paused;
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

async function refreshPauseState() {
  try {
    const s = await chrome.runtime.sendMessage({ type: MSG.GET_PAUSE_STATE });
    state.paused = !!s?.paused;
    updatePauseUI();
  } catch { /* ignore */ }
}

els.search.addEventListener('input', () => {
  state.query = els.search.value;
  state.selectedIdx = 0;
  renderList();
});

els.search.addEventListener('keydown', (e) => {
  const visibleCount = filterClips().slice(0, 20).length;
  if (e.key === 'ArrowDown') {
    state.selectedIdx = Math.min(state.selectedIdx + 1, visibleCount - 1);
    updateSelectionHighlight();
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    state.selectedIdx = Math.max(state.selectedIdx - 1, 0);
    updateSelectionHighlight();
    e.preventDefault();
  } else if (e.key === 'Enter') {
    const clip = filterClips()[state.selectedIdx];
    if (clip) copyClip(clip, !e.shiftKey);
    e.preventDefault();
  } else if (e.key === 'Escape') {
    window.close();
  }
});

els.openPanel.addEventListener('click', async () => {
  try {
    const win = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: win.id });
    window.close();
  } catch (err) {
    console.warn('open side panel failed', err);
    showToast('Side panel not available');
  }
});

async function togglePause() {
  if (state.paused) {
    await chrome.runtime.sendMessage({ type: MSG.RESUME });
    state.paused = false;
  } else {
    await chrome.runtime.sendMessage({
      type: MSG.PAUSE,
      payload: { until: Date.now() + 10 * 60 * 1000 },
    });
    state.paused = true;
  }
  updatePauseUI();
}

els.pause.addEventListener('click', togglePause);
els.resumeBanner.addEventListener('click', togglePause);

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
refreshPauseState();
els.search.focus();
